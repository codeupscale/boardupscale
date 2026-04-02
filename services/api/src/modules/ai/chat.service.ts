import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { AiService } from './ai.service';
import { SearchService } from '../search/search.service';
import { Issue } from '../issues/entities/issue.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Page } from '../pages/entities/page.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';
import { Project } from '../projects/entities/project.entity';
import { Comment } from '../comments/entities/comment.entity';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatConversation)
    private conversationRepo: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private messageRepo: Repository<ChatMessage>,
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
    @InjectRepository(Issue)
    private issueRepo: Repository<Issue>,
    @InjectRepository(Sprint)
    private sprintRepo: Repository<Sprint>,
    @InjectRepository(Page)
    private pageRepo: Repository<Page>,
    @InjectRepository(ProjectMember)
    private memberRepo: Repository<ProjectMember>,
    @InjectRepository(Comment)
    private commentRepo: Repository<Comment>,
    private aiService: AiService,
    private searchService: SearchService,
  ) {}

  async listConversations(projectId: string, userId: string, organizationId: string) {
    return this.conversationRepo.find({
      where: { projectId, userId, organizationId, deletedAt: IsNull() },
      order: { lastMessageAt: 'DESC' },
      take: 20,
    });
  }

  async getConversation(id: string, userId: string, organizationId: string) {
    const conversation = await this.conversationRepo.findOne({
      where: { id, organizationId, deletedAt: IsNull() },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.userId !== userId) throw new ForbiddenException();

    const messages = await this.messageRepo.find({
      where: { conversationId: id },
      order: { createdAt: 'ASC' },
      take: 50,
    });

    return { ...conversation, messages };
  }

  async createConversation(projectId: string, userId: string, organizationId: string) {
    const conversation = this.conversationRepo.create({
      projectId,
      userId,
      organizationId,
    });
    return this.conversationRepo.save(conversation);
  }

  async deleteConversation(id: string, userId: string, organizationId: string) {
    const conversation = await this.conversationRepo.findOne({
      where: { id, organizationId, deletedAt: IsNull() },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.userId !== userId) throw new ForbiddenException();

    conversation.deletedAt = new Date();
    await this.conversationRepo.save(conversation);
  }

  async *sendMessageStream(
    conversationId: string,
    content: string,
    userId: string,
    organizationId: string,
  ): AsyncGenerator<{ event: string; data: any }> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId, organizationId, deletedAt: IsNull() },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.userId !== userId) throw new ForbiddenException();

    // Save user message
    const userMessage = this.messageRepo.create({
      conversationId,
      role: 'user' as const,
      content,
    });
    await this.messageRepo.save(userMessage);

    // Auto-title from first message
    if (conversation.title === 'New conversation') {
      conversation.title = content.slice(0, 80) + (content.length > 80 ? '...' : '');
      await this.conversationRepo.save(conversation);
    }

    // Build context
    const projectContext = await this.buildProjectContext(
      conversation.projectId,
      organizationId,
      content,
    );

    // Get conversation history (last 20 messages)
    const history = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
      take: 20,
    });

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: projectContext },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // Stream the response
    let fullContent = '';
    let tokensUsed = 0;

    try {
      for await (const chunk of this.aiService.chatCompletionStream({
        messages,
        organizationId,
        userId,
        feature: 'chat',
        maxTokens: 1500,
      })) {
        if (chunk.type === 'chunk') {
          fullContent += chunk.content;
          yield { event: 'chunk', data: { content: chunk.content } };
        } else if (chunk.type === 'done') {
          tokensUsed = chunk.tokensUsed;
        }
      }

      if (!fullContent) {
        yield { event: 'error', data: { message: 'AI is not available or token limit exceeded.' } };
        return;
      }

      // Save assistant message
      const assistantMessage = this.messageRepo.create({
        conversationId,
        role: 'assistant' as const,
        content: fullContent,
        tokensUsed,
      });
      const saved = await this.messageRepo.save(assistantMessage);

      // Update conversation timestamp
      conversation.lastMessageAt = new Date();
      await this.conversationRepo.save(conversation);

      yield { event: 'done', data: { messageId: saved.id, tokensUsed } };
    } catch (err: any) {
      this.logger.error(`Chat stream error: ${err.message}`);
      yield { event: 'error', data: { message: 'An error occurred while generating a response.' } };
    }
  }

  private async buildProjectContext(
    projectId: string,
    organizationId: string,
    userQuery: string,
  ): Promise<string> {
    const parts: string[] = [];

    // 1. Project info
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (project) {
      parts.push(
        `You are Boardupscale AI, an assistant for the project "${project.name}" (key: ${project.key}, type: ${project.type}).`,
        `You help team members understand issues, sprints, and project progress.`,
        '',
        'Rules:',
        '- Answer based on the project context provided below. If you don\'t have enough information, say so.',
        '- Reference issue keys (e.g., ' + project.key + '-123) when discussing specific issues.',
        '- Be concise and actionable.',
        '- Do not make up issue details not in the context.',
        '- Format responses using Markdown.',
        '',
      );
      if (project.description) {
        parts.push(`Project description: ${project.description}`, '');
      }
    }

    // 2. Active sprint
    const activeSprint = await this.sprintRepo.findOne({
      where: { projectId, status: 'active' },
    });
    if (activeSprint) {
      const sprintIssueCount = await this.issueRepo.count({
        where: { sprintId: activeSprint.id, organizationId },
      });
      parts.push(
        `ACTIVE SPRINT: "${activeSprint.name}"`,
        `  Goal: ${activeSprint.goal || 'No goal set'}`,
        `  Dates: ${activeSprint.startDate || '?'} to ${activeSprint.endDate || '?'}`,
        `  Issues: ${sprintIssueCount}`,
        '',
      );
    }

    // 3. Team members
    const members = await this.memberRepo.find({
      where: { projectId },
      relations: ['user'],
      take: 15,
    });
    if (members.length > 0) {
      parts.push('TEAM MEMBERS:');
      for (const m of members) {
        parts.push(`  - ${m.user?.displayName || m.user?.email || 'Unknown'} (${m.role})`);
      }
      parts.push('');
    }

    // 4. Search relevant issues
    try {
      const searchResult = await this.searchService.search({
        q: userQuery,
        organizationId,
        projectId,
        limit: 5,
      });
      if (searchResult.items.length > 0) {
        parts.push('RELEVANT ISSUES:');
        for (const item of searchResult.items) {
          parts.push(
            `  ${item.key}: ${item.title} [${item.type}/${item.priority}] Status: ${item.statusName || 'Unknown'} Assignee: ${item.assigneeName || 'Unassigned'}`,
          );
        }
        parts.push('');
      }
    } catch (err: any) {
      this.logger.warn(`Search failed during chat context: ${err.message}`);
    }

    // 5. Direct issue lookup if query contains an issue key
    const issueKeyMatch = userQuery.match(/[A-Z]+-\d+/g);
    if (issueKeyMatch) {
      for (const key of issueKeyMatch.slice(0, 3)) {
        const issue = await this.issueRepo.findOne({
          where: { key, organizationId },
          relations: ['assignee', 'reporter', 'status'],
        });
        if (issue) {
          parts.push(`ISSUE DETAIL [${issue.key}]:`, `  Title: ${issue.title}`);
          if (issue.description) {
            parts.push(`  Description: ${issue.description.slice(0, 500)}`);
          }
          parts.push(
            `  Type: ${issue.type} | Priority: ${issue.priority} | Status: ${(issue as any).status?.name || 'Unknown'}`,
            `  Assignee: ${issue.assignee?.displayName || 'Unassigned'} | Reporter: ${issue.reporter?.displayName || 'Unknown'}`,
            `  Story Points: ${issue.storyPoints ?? 'N/A'} | Due: ${issue.dueDate || 'None'}`,
          );

          // Fetch recent comments for this issue
          const comments = await this.commentRepo.find({
            where: { issueId: issue.id },
            relations: ['author'],
            order: { createdAt: 'DESC' },
            take: 5,
          });
          if (comments.length > 0) {
            parts.push(`  Recent comments:`);
            for (const c of comments) {
              parts.push(
                `    - ${c.author?.displayName || 'Unknown'}: ${c.content.slice(0, 200)}`,
              );
            }
          }
          parts.push('');
        }
      }
    }

    // 6. Relevant pages/docs
    if (userQuery.length > 3) {
      try {
        const pages = await this.pageRepo
          .createQueryBuilder('page')
          .where('page.project_id = :projectId', { projectId })
          .andWhere('page.organization_id = :organizationId', { organizationId })
          .andWhere('page.deleted_at IS NULL')
          .andWhere('(page.title ILIKE :q OR page.content ILIKE :q)', {
            q: `%${userQuery.slice(0, 50)}%`,
          })
          .orderBy('page.updated_at', 'DESC')
          .take(3)
          .getMany();

        if (pages.length > 0) {
          parts.push('RELEVANT PAGES:');
          for (const p of pages) {
            parts.push(`  "${p.title}": ${p.content.slice(0, 300)}`);
          }
          parts.push('');
        }
      } catch (err: any) {
        this.logger.warn(`Page search failed during chat context: ${err.message}`);
      }
    }

    return parts.join('\n');
  }
}
