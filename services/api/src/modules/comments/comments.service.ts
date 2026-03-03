import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { Issue } from '../issues/entities/issue.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../../websocket/events.gateway';
import { WebhookEventEmitter } from '../webhooks/webhook-event-emitter.service';
import { WebhookEventType } from '../webhooks/webhook-events.constants';
import { AutomationEngineService } from '../automation/automation-engine.service';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
    @InjectRepository(Issue)
    private issueRepository: Repository<Issue>,
    private notificationsService: NotificationsService,
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
}
