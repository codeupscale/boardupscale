import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Queue } from 'bullmq';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { Issue } from '../issues/entities/issue.entity';
import { Comment } from '../comments/entities/comment.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { User } from '../users/entities/user.entity';
import {
  AiStatusResponse,
  FieldSuggestions,
  AssigneeSuggestion,
  IssueSummary,
  SprintInsights,
  WorkloadItem,
} from './ai.types';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private openai: any = null;
  private available = false;

  constructor(
    @InjectRepository(AiUsageLog)
    private usageLogRepository: Repository<AiUsageLog>,
    @InjectRepository(Issue)
    private issueRepository: Repository<Issue>,
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
    @InjectRepository(Sprint)
    private sprintRepository: Repository<Sprint>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectQueue('ai')
    private aiQueue: Queue,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.initOpenAI();
  }

  private async initOpenAI(): Promise<void> {
    const enabled = this.configService.get<boolean>('ai.enabled');
    const apiKey = this.configService.get<string>('ai.openaiApiKey');

    if (!enabled) {
      this.logger.log('AI features are disabled (AI_ENABLED=false)');
      return;
    }

    if (!apiKey) {
      this.logger.warn('AI is enabled but OPENAI_API_KEY is not set — AI features will be unavailable');
      return;
    }

    try {
      // Dynamic import of OpenAI — use require to avoid TS2307 in watch mode
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const OpenAI = require('openai').default || require('openai');
      this.openai = new OpenAI({ apiKey });

      // Quick validation — list models (fast, lightweight)
      this.available = true;
      this.logger.log(`AI features initialized. Model: ${this.configService.get<string>('ai.model')}`);
    } catch (err: any) {
      this.available = false;
      this.openai = null;
      this.logger.warn(`AI initialization failed: ${err.message} — AI features unavailable`);
    }
  }

  isAvailable(): boolean {
    return this.available && this.openai != null;
  }

  isEnabled(): boolean {
    return this.configService.get<boolean>('ai.enabled') === true;
  }

  async getStatus(organizationId?: string): Promise<AiStatusResponse> {
    if (!this.isEnabled()) {
      return { enabled: false };
    }

    const result: AiStatusResponse = {
      enabled: this.isAvailable(),
      model: this.configService.get<string>('ai.model'),
      embeddingModel: this.configService.get<string>('ai.embeddingModel'),
    };

    if (organizationId) {
      const tokensUsedToday = await this.getTokensUsedToday(organizationId);
      const dailyLimit = this.configService.get<number>('ai.maxTokensPerOrgPerDay');
      result.usage = {
        tokensUsedToday,
        dailyLimit,
        percentUsed: dailyLimit > 0 ? Math.round((tokensUsedToday / dailyLimit) * 100) : 0,
      };
    }

    return result;
  }

  // ── Embedding ──

  async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.isAvailable()) return null;

    try {
      const startMs = Date.now();
      const model = this.configService.get<string>('ai.embeddingModel');
      const response = await this.openai.embeddings.create({
        model,
        input: text.slice(0, 8000), // Max input length safety
      });
      const latencyMs = Date.now() - startMs;
      const embedding = response.data[0].embedding;

      this.logger.debug(`Embedding generated in ${latencyMs}ms (${embedding.length} dims)`);
      return embedding;
    } catch (err: any) {
      this.logger.warn(`Embedding generation failed: ${err.message}`);
      return null;
    }
  }

  async enqueueEmbedding(issueId: string, organizationId: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.aiQueue.add('generate-embedding', { issueId, organizationId }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to enqueue embedding job: ${err.message}`);
    }
  }

  // ── Chat Completion ──

  async chatCompletion(params: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    organizationId: string;
    userId?: string;
    feature: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ content: string; tokensUsed: number } | null> {
    if (!this.isAvailable()) return null;

    // Check daily limit
    if (await this.isOverDailyLimit(params.organizationId)) {
      this.logger.warn(`Organization ${params.organizationId} exceeded daily AI token limit`);
      return null;
    }

    try {
      const startMs = Date.now();
      const model = this.configService.get<string>('ai.model');
      const response = await this.openai.chat.completions.create({
        model,
        messages: params.messages,
        max_tokens: params.maxTokens || 1000,
        temperature: params.temperature ?? 0.3,
      });
      const latencyMs = Date.now() - startMs;

      const choice = response.choices[0];
      const usage = response.usage;

      // Log usage
      await this.logUsage({
        organizationId: params.organizationId,
        userId: params.userId,
        feature: params.feature,
        model,
        promptTokens: usage?.prompt_tokens || 0,
        completionTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
        latencyMs,
      });

      return {
        content: choice.message.content || '',
        tokensUsed: usage?.total_tokens || 0,
      };
    } catch (err: any) {
      this.logger.warn(`Chat completion failed: ${err.message}`);
      return null;
    }
  }

  // ── Field Suggestions ──

  async suggestFields(params: {
    title: string;
    description?: string;
    projectId?: string;
    organizationId: string;
    userId?: string;
  }): Promise<FieldSuggestions | null> {
    const systemPrompt = `You are a project management AI assistant for a Jira-like tool called Boardupscale.
Given an issue title (and optional description), classify the issue and suggest:
1. type: one of "bug", "task", "story", "epic", "subtask"
2. priority: one of "critical", "high", "medium", "low"
3. title: an improved, clearer version of the title (or null if already good)

Respond in JSON only: {"type":"...","priority":"...","title":"..."}`;

    const userMessage = params.description
      ? `Title: ${params.title}\nDescription: ${params.description}`
      : `Title: ${params.title}`;

    const result = await this.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      organizationId: params.organizationId,
      userId: params.userId,
      feature: 'suggest-fields',
      maxTokens: 200,
      temperature: 0.2,
    });

    if (!result) return null;

    try {
      const parsed = JSON.parse(result.content);
      const suggestions: FieldSuggestions = {};
      if (parsed.type) suggestions.type = parsed.type;
      if (parsed.priority) suggestions.priority = parsed.priority;
      if (parsed.title && parsed.title !== params.title) suggestions.title = parsed.title;

      // Get assignee suggestions (SQL-based, no LLM)
      if (params.projectId) {
        suggestions.assignees = await this.suggestAssignees({
          projectId: params.projectId,
          organizationId: params.organizationId,
          type: parsed.type,
        });
      }

      return suggestions;
    } catch {
      this.logger.warn('Failed to parse AI field suggestions response');
      return null;
    }
  }

  // ── Assignee Suggestions (SQL-based) ──

  async suggestAssignees(params: {
    projectId: string;
    organizationId: string;
    type?: string;
    limit?: number;
  }): Promise<AssigneeSuggestion[]> {
    const { projectId, organizationId, type, limit = 3 } = params;

    // Query: most-assigned users in this project, weighted by recent activity
    const query = `
      SELECT
        u.id AS "userId",
        u.display_name AS "displayName",
        u.avatar_url AS "avatarUrl",
        COUNT(i.id) AS total_issues,
        COUNT(CASE WHEN i.created_at > NOW() - INTERVAL '30 days' THEN 1 END) AS recent_issues,
        COUNT(CASE WHEN i.type = $3 THEN 1 END) AS type_matches
      FROM users u
      JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = $1
      LEFT JOIN issues i ON i.assignee_id = u.id AND i.project_id = $1 AND i.deleted_at IS NULL
      WHERE u.organization_id = $2 AND u.is_active = true
      GROUP BY u.id, u.display_name, u.avatar_url
      ORDER BY type_matches DESC, recent_issues DESC, total_issues DESC
      LIMIT $4
    `;

    try {
      const results = await this.issueRepository.query(query, [
        projectId,
        organizationId,
        type || '',
        limit,
      ]);

      return results.map((r: any, idx: number) => {
        let reason = 'Active project member';
        if (r.type_matches > 0) {
          reason = `Handled ${r.type_matches} ${type || 'similar'} issues`;
        } else if (r.recent_issues > 0) {
          reason = `${r.recent_issues} recent issues in this project`;
        }
        return {
          userId: r.userId,
          displayName: r.displayName,
          avatarUrl: r.avatarUrl,
          reason,
          score: Math.max(0, 1 - idx * 0.25),
        };
      });
    } catch (err: any) {
      this.logger.warn(`Assignee suggestion query failed: ${err.message}`);
      return [];
    }
  }

  // ── Issue Summarization ──

  async summarizeIssue(params: {
    issueId: string;
    organizationId: string;
    userId?: string;
  }): Promise<IssueSummary | null> {
    const issue = await this.issueRepository.findOne({
      where: { id: params.issueId, organizationId: params.organizationId },
      relations: ['status', 'assignee', 'reporter', 'project'],
    });

    if (!issue) return null;

    const comments = await this.commentRepository.find({
      where: { issueId: params.issueId },
      relations: ['author'],
      order: { createdAt: 'ASC' },
      take: 50, // Limit to avoid token overflow
    });

    const commentsText = comments.map((c) =>
      `[${c.author?.displayName || 'Unknown'} at ${c.createdAt.toISOString()}]: ${c.content}`
    ).join('\n');

    const systemPrompt = `You are a project management AI assistant. Summarize the following issue and its discussion.

Provide a structured summary in JSON:
{
  "summary": "Brief 1-2 sentence summary of the issue and its current state",
  "keyDecisions": ["Array of key decisions made in the discussion"],
  "blockers": ["Array of any blockers or concerns raised"],
  "nextSteps": ["Array of suggested or agreed-upon next steps"]
}

Be concise. If there are no comments, base the summary on the issue details alone.`;

    const issueContext = `Issue: ${issue.key} - ${issue.title}
Type: ${issue.type} | Priority: ${issue.priority} | Status: ${issue.status?.name || 'Unknown'}
Assignee: ${issue.assignee?.displayName || 'Unassigned'}
Reporter: ${issue.reporter?.displayName || 'Unknown'}
Description: ${issue.description || 'No description'}

Comments (${comments.length}):
${commentsText || 'No comments yet.'}`;

    const result = await this.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: issueContext },
      ],
      organizationId: params.organizationId,
      userId: params.userId,
      feature: 'summarize-issue',
      maxTokens: 600,
      temperature: 0.3,
    });

    if (!result) return null;

    try {
      const parsed = JSON.parse(result.content);
      return {
        summary: parsed.summary || '',
        keyDecisions: parsed.keyDecisions || [],
        blockers: parsed.blockers || [],
        nextSteps: parsed.nextSteps || [],
        generatedAt: new Date().toISOString(),
      };
    } catch {
      // If JSON parsing fails, return raw text as summary
      return {
        summary: result.content,
        keyDecisions: [],
        blockers: [],
        nextSteps: [],
        generatedAt: new Date().toISOString(),
      };
    }
  }

  // ── Sprint Intelligence ──

  async getSprintInsights(params: {
    sprintId: string;
    organizationId: string;
    userId?: string;
  }): Promise<SprintInsights | null> {
    const sprint = await this.sprintRepository.findOne({
      where: { id: params.sprintId },
      relations: ['project'],
    });

    if (!sprint) return null;

    // Get all issues in this sprint
    const issues = await this.issueRepository.find({
      where: {
        sprintId: params.sprintId,
        organizationId: params.organizationId,
      },
      relations: ['status', 'assignee'],
    });

    if (issues.length === 0) {
      return {
        sprintId: sprint.id,
        sprintName: sprint.name,
        completionPrediction: {
          percentage: 0,
          predictedEndDate: sprint.endDate?.toString() || '',
          onTrack: true,
        },
        workloadBalance: [],
        suggestions: ['No issues in this sprint yet. Add issues to get insights.'],
        generatedAt: new Date().toISOString(),
      };
    }

    // Calculate stats
    const totalPoints = issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    const doneIssues = issues.filter((i) => i.status?.category === 'done');
    const completedPoints = doneIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    const completionPct = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0;

    // Workload per assignee
    const workloadMap = new Map<string, WorkloadItem>();
    for (const issue of issues) {
      const uid = issue.assigneeId || 'unassigned';
      const name = issue.assignee?.displayName || 'Unassigned';
      if (!workloadMap.has(uid)) {
        workloadMap.set(uid, {
          userId: uid,
          displayName: name,
          assignedPoints: 0,
          completedPoints: 0,
          issueCount: 0,
        });
      }
      const w = workloadMap.get(uid)!;
      w.assignedPoints += issue.storyPoints || 0;
      w.issueCount++;
      if (issue.status?.category === 'done') {
        w.completedPoints += issue.storyPoints || 0;
      }
    }

    const workloadBalance = Array.from(workloadMap.values());

    // Calculate days remaining
    const now = new Date();
    const endDate = sprint.endDate ? new Date(sprint.endDate) : null;
    const daysRemaining = endDate ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / 86400000)) : 0;
    const startDate = sprint.startDate ? new Date(sprint.startDate) : null;
    const totalDays = startDate && endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) : 14;
    const daysElapsed = totalDays - daysRemaining;
    const expectedPct = totalDays > 0 ? Math.round((daysElapsed / totalDays) * 100) : 0;
    const onTrack = completionPct >= expectedPct - 15; // 15% buffer

    // Generate AI suggestions
    const sprintContext = `Sprint: ${sprint.name}
Total Issues: ${issues.length}, Completed: ${doneIssues.length}
Story Points: ${completedPoints}/${totalPoints} completed (${completionPct}%)
Days Remaining: ${daysRemaining}/${totalDays}
Expected Progress: ${expectedPct}%, Actual: ${completionPct}%
On Track: ${onTrack ? 'Yes' : 'No'}

Workload:
${workloadBalance.map((w) => `- ${w.displayName}: ${w.assignedPoints} SP assigned, ${w.completedPoints} SP done, ${w.issueCount} issues`).join('\n')}`;

    let suggestions: string[] = [];

    // Only call LLM if actually available and sprint is active
    if (this.isAvailable() && sprint.status === 'active') {
      const result = await this.chatCompletion({
        messages: [
          {
            role: 'system',
            content: 'You are a sprint coach. Given sprint metrics, provide 2-4 brief actionable suggestions (one sentence each). Respond as a JSON array of strings: ["suggestion 1", "suggestion 2"]',
          },
          { role: 'user', content: sprintContext },
        ],
        organizationId: params.organizationId,
        userId: params.userId,
        feature: 'sprint-insights',
        maxTokens: 300,
        temperature: 0.4,
      });

      if (result) {
        try {
          suggestions = JSON.parse(result.content);
        } catch {
          suggestions = [result.content];
        }
      }
    }

    // Add fallback suggestions based on data
    if (suggestions.length === 0) {
      if (!onTrack) suggestions.push('Sprint is behind schedule. Consider reducing scope or reassigning work.');
      if (workloadBalance.some((w) => w.assignedPoints > totalPoints * 0.5)) {
        suggestions.push('Workload is heavily concentrated. Consider distributing issues more evenly.');
      }
      if (issues.filter((i) => !i.assigneeId).length > 0) {
        suggestions.push('Some issues are unassigned. Assign them to team members.');
      }
      if (suggestions.length === 0) suggestions.push('Sprint is progressing well. Keep up the momentum!');
    }

    return {
      sprintId: sprint.id,
      sprintName: sprint.name,
      completionPrediction: {
        percentage: completionPct,
        predictedEndDate: endDate?.toISOString() || '',
        onTrack,
      },
      workloadBalance,
      suggestions,
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Token Usage ──

  async isOverDailyLimit(organizationId: string): Promise<boolean> {
    const tokensUsed = await this.getTokensUsedToday(organizationId);
    const limit = this.configService.get<number>('ai.maxTokensPerOrgPerDay');
    return tokensUsed >= limit;
  }

  private async getTokensUsedToday(organizationId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const result = await this.usageLogRepository
      .createQueryBuilder('log')
      .select('COALESCE(SUM(log.total_tokens), 0)', 'total')
      .where('log.organization_id = :organizationId', { organizationId })
      .andWhere('log.created_at >= :startOfDay', { startOfDay })
      .getRawOne();

    return parseInt(result?.total || '0', 10);
  }

  private async logUsage(params: {
    organizationId: string;
    userId?: string;
    feature: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    cached?: boolean;
  }): Promise<void> {
    try {
      const log = this.usageLogRepository.create({
        organizationId: params.organizationId,
        userId: params.userId || null,
        feature: params.feature,
        model: params.model,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        totalTokens: params.totalTokens,
        latencyMs: params.latencyMs,
        cached: params.cached || false,
      });
      await this.usageLogRepository.save(log);
    } catch (err: any) {
      this.logger.warn(`Failed to log AI usage: ${err.message}`);
    }
  }
}
