import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, IsNull } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { Issue } from '../issues/entities/issue.entity';
import { User } from '../users/entities/user.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { UsersService } from '../users/users.service';
import { EventsGateway } from '../../websocket/events.gateway';
import { WebhookEventEmitter } from '../webhooks/webhook-event-emitter.service';
import { WebhookEventType } from '../webhooks/webhook-events.constants';
import { AutomationEngineService } from '../automation/automation-engine.service';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
    @InjectRepository(Issue)
    private issueRepository: Repository<Issue>,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
    private usersService: UsersService,
    private configService: ConfigService,
    private eventsGateway: EventsGateway,
    private webhookEventEmitter: WebhookEventEmitter,
    @Optional() @Inject(AutomationEngineService)
    private automationEngine?: AutomationEngineService,
  ) {}

  async findAll(issueId: string): Promise<Comment[]> {
    return this.commentRepository.find({
      where: { issueId, deletedAt: IsNull() },
      relations: ['author'],
      order: { createdAt: 'ASC' },
    });
  }

  async create(dto: CreateCommentDto, userId: string, organizationId: string): Promise<Comment> {
    const issue = await this.issueRepository.findOne({
      where: { id: dto.issueId, organizationId, deletedAt: IsNull() },
    });
    if (!issue) {
      throw new NotFoundException('Issue not found');
    }

    const comment = this.commentRepository.create({
      issueId: dto.issueId,
      authorId: userId,
      content: dto.content,
    });
    const saved = await this.commentRepository.save(comment);

    const full = await this.commentRepository.findOne({
      where: { id: saved.id },
      relations: ['author'],
    });

    this.eventsGateway.emitToOrg(organizationId, 'comment:created', {
      ...full,
      issueId: dto.issueId,
    });

    this.webhookEventEmitter.emit(
      organizationId,
      issue.projectId,
      WebhookEventType.COMMENT_CREATED,
      { comment: full, issueId: dto.issueId, issueKey: issue.key },
    );

    if (issue.reporterId && issue.reporterId !== userId) {
      await this.notificationsService.create({
        userId: issue.reporterId,
        type: 'comment:created',
        title: `New comment on ${issue.key}`,
        body: dto.content.substring(0, 200),
        data: { issueId: dto.issueId, commentId: saved.id },
      });
    }

    if (
      issue.assigneeId &&
      issue.assigneeId !== userId &&
      issue.assigneeId !== issue.reporterId
    ) {
      await this.notificationsService.create({
        userId: issue.assigneeId,
        type: 'comment:created',
        title: `New comment on ${issue.key}`,
        body: dto.content.substring(0, 200),
        data: { issueId: dto.issueId, commentId: saved.id },
      });
    }

    // FR-NOT-006: @mention detection
    this.processMentions(dto.content, userId, issue, saved.id, full?.author?.displayName || 'Someone').catch(
      (err) => this.logger.error('Failed to process @mentions:', err.message),
    );

    // Trigger automation rules
    if (this.automationEngine) {
      this.automationEngine.processTrigger(issue.projectId, 'comment.added', {
        issueId: dto.issueId,
        userId,
        commentId: saved.id,
      });
    }

    return full;
  }

  async update(id: string, userId: string, dto: UpdateCommentDto): Promise<Comment> {
    const comment = await this.commentRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own comments');
    }
    comment.content = dto.content;
    comment.editedAt = new Date();
    const saved = await this.commentRepository.save(comment);

    const issue = await this.issueRepository.findOne({ where: { id: comment.issueId } });
    if (issue) {
      this.webhookEventEmitter.emit(
        issue.organizationId,
        issue.projectId,
        WebhookEventType.COMMENT_UPDATED,
        { comment: saved, issueId: comment.issueId, issueKey: issue.key },
      );
    }

    return saved;
  }

  async delete(id: string, userId: string): Promise<void> {
    const comment = await this.commentRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }
    await this.commentRepository.update(id, { deletedAt: new Date() });

    const issue = await this.issueRepository.findOne({ where: { id: comment.issueId } });
    if (issue) {
      this.webhookEventEmitter.emit(
        issue.organizationId,
        issue.projectId,
        WebhookEventType.COMMENT_DELETED,
        { commentId: id, issueId: comment.issueId, issueKey: issue.key },
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // @Mention helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Parse @mentions from comment text and create in-app + email notifications.
   *
   * Supported mention formats:
   *   - @[Display Name](userId)   — rich mention from autocomplete
   *   - @username / @displayname  — plain text mention (matched against org users)
   */
  private async processMentions(
    content: string,
    authorId: string,
    issue: Issue,
    commentId: string,
    commenterName: string,
  ): Promise<void> {
    const mentionedUserIds = new Set<string>();

    // Pattern 1: Rich mention @[DisplayName](userId)
    const richMentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = richMentionRegex.exec(content)) !== null) {
      const userId = match[2];
      if (userId && userId !== authorId) {
        mentionedUserIds.add(userId);
      }
    }

    // Pattern 2: Plain @word mentions (matched against organization users)
    const plainMentionRegex = /@(\w[\w.-]*\w|\w)/g;
    // Strip out already-matched rich mentions before scanning plain ones
    const strippedContent = content.replace(richMentionRegex, '');
    while ((match = plainMentionRegex.exec(strippedContent)) !== null) {
      const mentionText = match[1].toLowerCase();
      try {
        const orgUsers = await this.usersService.findByOrg(issue.organizationId);
        for (const user of orgUsers) {
          if (user.id === authorId) continue;
          if (mentionedUserIds.has(user.id)) continue;
          // Match against displayName (case-insensitive, spaces replaced with dots/underscores)
          const normalizedName = user.displayName.toLowerCase().replace(/\s+/g, '');
          const normalizedMention = mentionText.replace(/[._-]/g, '');
          if (
            normalizedName === normalizedMention ||
            user.email.split('@')[0].toLowerCase() === mentionText
          ) {
            mentionedUserIds.add(user.id);
          }
        }
      } catch {
        // Org user lookup failed; skip plain mention resolution
      }
    }

    if (mentionedUserIds.size === 0) return;

    const frontendUrl =
      this.configService.get<string>('app.frontendUrl') || 'http://localhost:3000';
    const issueUrl = `${frontendUrl}/issues/${issue.id}`;

    for (const mentionedUserId of mentionedUserIds) {
      // In-app notification
      await this.notificationsService.create({
        userId: mentionedUserId,
        type: 'mention',
        title: `${commenterName} mentioned you in ${issue.key}`,
        body: content.substring(0, 200),
        data: { issueId: issue.id, commentId },
      });

      // Email notification
      try {
        const mentionedUser = await this.usersService.findById(mentionedUserId);
        await this.emailService.sendCommentMentionEmail(
          mentionedUser.email,
          mentionedUser.displayName,
          commenterName,
          issue.key,
          issue.title,
          content,
          issueUrl,
        );
      } catch (err) {
        this.logger.error(
          `Failed to send mention email to user ${mentionedUserId}:`,
          err.message,
        );
      }
    }
  }
}
