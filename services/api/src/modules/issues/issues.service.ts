import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Repository, IsNull, In, Not } from 'typeorm';
import { Queue } from 'bullmq';
import { Issue } from './entities/issue.entity';
import { IssueStatus } from './entities/issue-status.entity';
import { WorkLog } from './entities/work-log.entity';
import { IssueLink } from './entities/issue-link.entity';
import { IssueWatcher } from './entities/issue-watcher.entity';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { CreateWorkLogDto } from './dto/create-work-log.dto';
import { CreateIssueLinkDto } from './dto/create-issue-link.dto';
import { BulkUpdateIssuesDto } from './dto/bulk-update-issues.dto';
import { BulkMoveIssuesDto } from './dto/bulk-move-issues.dto';
import { BulkDeleteIssuesDto } from './dto/bulk-delete-issues.dto';
import { BulkTransitionIssuesDto } from './dto/bulk-transition-issues.dto';
import { ProjectsService } from '../projects/projects.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { UsersService } from '../users/users.service';
import { EventsGateway } from '../../websocket/events.gateway';
import { WebhookEventEmitter } from '../webhooks/webhook-event-emitter.service';
import { WebhookEventType } from '../webhooks/webhook-events.constants';
import { AutomationEngineService } from '../automation/automation-engine.service';
import { ActivityService } from '../activity/activity.service';
import { AuditService } from '../audit/audit.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);

  constructor(
    @InjectRepository(Issue)
    private issueRepository: Repository<Issue>,
    @InjectRepository(IssueStatus)
    private issueStatusRepository: Repository<IssueStatus>,
    @InjectRepository(WorkLog)
    private workLogRepository: Repository<WorkLog>,
    @InjectRepository(IssueLink)
    private issueLinkRepository: Repository<IssueLink>,
    @InjectRepository(IssueWatcher)
    private issueWatcherRepository: Repository<IssueWatcher>,
    private projectsService: ProjectsService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
    private usersService: UsersService,
    private configService: ConfigService,
    private eventsGateway: EventsGateway,
    private webhookEventEmitter: WebhookEventEmitter,
    @InjectQueue('search-index')
    private searchIndexQueue: Queue,
    private activityService: ActivityService,
    private auditService: AuditService,
    @Optional() @Inject(AutomationEngineService)
    private automationEngine?: AutomationEngineService,
    @Optional() @Inject(AiService)
    private aiService?: AiService,
  ) {}

  /**
   * Build an Elasticsearch-compatible issue document from a full Issue entity.
   */
  private buildSearchDocument(issue: Issue): Record<string, any> {
    return {
      id: issue.id,
      organizationId: issue.organizationId,
      projectId: issue.projectId,
      projectName: issue.project?.name || '',
      key: issue.key,
      title: issue.title,
      description: issue.description || '',
      type: issue.type,
      priority: issue.priority,
      statusName: issue.status?.name || '',
      assigneeName: issue.assignee?.displayName || '',
      labels: issue.labels || [],
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };
  }

  /**
   * Enqueue an index-issue job for the search worker.
   */
  private async enqueueSearchIndex(issue: Issue): Promise<void> {
    try {
      await this.searchIndexQueue.add('index-issue', {
        issue: this.buildSearchDocument(issue),
      });
    } catch (err: any) {
      this.logger.warn(`Failed to enqueue search index job for issue ${issue.id}: ${err.message}`);
    }
  }

  /**
   * Enqueue a delete-issue job for the search worker.
   */
  private async enqueueSearchDelete(issueId: string): Promise<void> {
    try {
      await this.searchIndexQueue.add('delete-issue', {
        issueId,
      });
    } catch (err: any) {
      this.logger.warn(`Failed to enqueue search delete job for issue ${issueId}: ${err.message}`);
    }
  }

  async findAll(filters: {
    organizationId: string;
    projectId?: string;
    sprintId?: string;
    assigneeId?: string;
    type?: string;
    priority?: string;
    statusId?: string;
    search?: string;
    page?: number;
    limit?: number;
    backlog?: boolean;
    deleted?: boolean;
  }) {
    const { organizationId, projectId, sprintId, assigneeId, type, priority, statusId, search, page = 1, limit = 20, backlog, deleted } = filters;

    const qb = this.issueRepository
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.status', 'status')
      .leftJoin('issue.assignee', 'assignee')
      .addSelect(['assignee.id', 'assignee.displayName', 'assignee.avatarUrl', 'assignee.email'])
      .leftJoin('issue.reporter', 'reporter')
      .addSelect(['reporter.id', 'reporter.displayName', 'reporter.avatarUrl', 'reporter.email'])
      .leftJoinAndSelect('issue.sprint', 'sprint')
      .where('issue.organization_id = :organizationId', { organizationId });

    if (deleted) {
      qb.andWhere('issue.deleted_at IS NOT NULL');
    } else {
      qb.andWhere('issue.deleted_at IS NULL');
    }

    if (projectId) {
      qb.andWhere('issue.project_id = :projectId', { projectId });
    }
    if (sprintId === 'backlog') {
      qb.andWhere('issue.sprint_id IS NULL');
    } else if (sprintId) {
      qb.andWhere('issue.sprint_id = :sprintId', { sprintId });
    }
    if (assigneeId) {
      qb.andWhere('issue.assignee_id = :assigneeId', { assigneeId });
    }
    if (type) {
      qb.andWhere('issue.type = :type', { type });
    }
    if (priority) {
      qb.andWhere('issue.priority = :priority', { priority });
    }
    if (statusId) {
      qb.andWhere('issue.status_id = :statusId', { statusId });
    }
    if (search) {
      qb.andWhere('(issue.title ILIKE :search OR issue.key ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const total = await qb.getCount();
    const items = await qb
      .orderBy('issue.position', 'ASC')
      .addOrderBy('issue.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { items, total, page, limit };
  }

  async findById(id: string, organizationId: string): Promise<Issue> {
    const issue = await this.issueRepository.findOne({
      where: { id, organizationId, deletedAt: IsNull() },
      relations: ['status', 'assignee', 'reporter', 'sprint', 'parent', 'parent.parent', 'parent.parent.parent', 'project'],
    });
    if (!issue) {
      throw new NotFoundException('Issue not found');
    }
    return issue;
  }

  /**
   * Validates parent-child type hierarchy:
   *   Epic -> Story, Task, Bug
   *   Story -> Task, Bug, Subtask
   *   Task, Bug -> Subtask
   *   Subtask -> (none)
   */
  private validateChildTypeHierarchy(parentType: string, childType: string): void {
    const allowedChildren: Record<string, string[]> = {
      epic: ['story', 'task', 'bug'],
      story: ['task', 'bug', 'subtask'],
      task: ['subtask'],
      bug: ['subtask'],
    };

    const allowed = allowedChildren[parentType];
    if (!allowed) {
      throw new BadRequestException(
        `Issues of type "${parentType}" cannot have child issues`,
      );
    }

    if (!allowed.includes(childType)) {
      throw new BadRequestException(
        `A "${parentType}" can only have children of type: ${allowed.join(', ')}. Got "${childType}"`,
      );
    }
  }

  async create(dto: CreateIssueDto, organizationId: string, userId: string): Promise<Issue> {
    const project = await this.projectsService.findById(dto.projectId, organizationId);

    // Validate parent-child hierarchy if parentId is set
    if (dto.parentId) {
      const parent = await this.issueRepository.findOne({
        where: { id: dto.parentId, organizationId },
      });
      if (!parent) {
        throw new NotFoundException('Parent issue not found');
      }
      this.validateChildTypeHierarchy(parent.type, dto.type || 'task');
    }

    let statusId = dto.statusId;
    if (!statusId) {
      const defaultStatus = await this.issueStatusRepository.findOne({
        where: { projectId: dto.projectId, isDefault: true },
        order: { position: 'ASC' },
      });
      if (!defaultStatus) {
        const firstStatus = await this.issueStatusRepository.findOne({
          where: { projectId: dto.projectId },
          order: { position: 'ASC' },
        });
        if (firstStatus) statusId = firstStatus.id;
      } else {
        statusId = defaultStatus.id;
      }
    }

    const issueNumber = await this.projectsService.getNextIssueNumber(dto.projectId);
    const key = `${project.key}-${issueNumber}`;

    const issue = this.issueRepository.create({
      ...dto,
      organizationId,
      reporterId: userId,
      statusId,
      key,
      number: issueNumber,
      position: issueNumber,
    });

    const saved = await this.issueRepository.save(issue);
    const fullIssue = await this.findById(saved.id, organizationId);

    // Auto-add reporter as watcher
    await this.addWatcherSilent(saved.id, userId);
    // Auto-add assignee as watcher
    if (dto.assigneeId && dto.assigneeId !== userId) {
      await this.addWatcherSilent(saved.id, dto.assigneeId);
    }

    this.eventsGateway.emitToOrg(organizationId, 'issue:created', fullIssue);

    this.webhookEventEmitter.emit(
      organizationId,
      dto.projectId,
      WebhookEventType.ISSUE_CREATED,
      { issue: fullIssue },
    );

    if (dto.assigneeId && dto.assigneeId !== userId) {
      await this.notificationsService.create({
        userId: dto.assigneeId,
        type: 'issue:assigned',
        title: `You have been assigned to ${key}`,
        body: dto.title,
        data: { issueId: saved.id, projectId: dto.projectId },
      });
      this.sendAssigneeEmail(dto.assigneeId, fullIssue);
    }

    // Enqueue search index job
    this.enqueueSearchIndex(fullIssue);

    // Enqueue AI embedding generation
    if (this.aiService) {
      this.aiService.enqueueEmbedding(saved.id, organizationId);
    }

    // Log activity
    this.activityService.log(organizationId, saved.id, userId, 'created', null, null, null, {
      key: fullIssue.key,
      title: fullIssue.title,
      type: fullIssue.type,
    });

    // Log audit
    this.auditService.log(organizationId, userId, 'issue.created', 'issue', saved.id, {
      key: fullIssue.key,
      title: fullIssue.title,
      projectId: dto.projectId,
    });

    // Trigger automation rules
    if (this.automationEngine) {
      this.automationEngine.processTrigger(dto.projectId, 'issue.created', {
        issueId: saved.id,
        userId,
      });
    }

    return fullIssue;
  }

  async update(id: string, organizationId: string, dto: UpdateIssueDto, userId: string): Promise<Issue> {
    const issue = await this.findById(id, organizationId);
    const prevAssigneeId = issue.assigneeId;
    const prevStatusId = issue.statusId;
    const prevPriority = issue.priority;

    // Capture previous values for activity logging
    const prevValues: Record<string, any> = {
      title: issue.title,
      description: issue.description,
      type: issue.type,
      priority: issue.priority,
      statusId: issue.statusId,
      assigneeId: issue.assigneeId,
      sprintId: issue.sprintId,
      dueDate: issue.dueDate,
      storyPoints: issue.storyPoints,
      timeEstimate: issue.timeEstimate,
      labels: issue.labels,
    };

    // Capture human-readable names for activity log display
    const prevNames: Record<string, string | null> = {
      statusId: issue.status?.name || null,
      assigneeId: issue.assignee?.displayName || null,
      sprintId: issue.sprint?.name || null,
    };

    Object.assign(issue, dto);

    // When updating FK columns, clear the loaded relation so TypeORM uses the
    // raw FK value instead of deriving it from the (stale) relation object.
    if ('assigneeId' in dto) issue.assignee = null;
    if ('sprintId' in dto) issue.sprint = null;
    if ('statusId' in dto) issue.status = null;
    if ('parentId' in dto) issue.parent = null;

    await this.issueRepository.save(issue);

    // Auto-add new assignee as watcher
    if (dto.assigneeId && dto.assigneeId !== prevAssigneeId) {
      await this.addWatcherSilent(id, dto.assigneeId);
    }

    const updatedIssue = await this.findById(id, organizationId);
    this.eventsGateway.emitToOrg(organizationId, 'issue:updated', updatedIssue);

    this.webhookEventEmitter.emit(
      organizationId,
      updatedIssue.projectId,
      WebhookEventType.ISSUE_UPDATED,
      { issue: updatedIssue },
    );

    if (dto.assigneeId && dto.assigneeId !== prevAssigneeId) {
      this.webhookEventEmitter.emit(
        organizationId,
        updatedIssue.projectId,
        WebhookEventType.ISSUE_ASSIGNED,
        { issue: updatedIssue, assigneeId: dto.assigneeId, previousAssigneeId: prevAssigneeId },
      );
    }

    if (dto.statusId && dto.statusId !== prevStatusId) {
      this.webhookEventEmitter.emit(
        organizationId,
        updatedIssue.projectId,
        WebhookEventType.ISSUE_STATUS_CHANGED,
        { issue: updatedIssue, statusId: dto.statusId, previousStatusId: prevStatusId },
      );
    }

    if (dto.assigneeId && dto.assigneeId !== prevAssigneeId && dto.assigneeId !== userId) {
      await this.notificationsService.create({
        userId: dto.assigneeId,
        type: 'issue:assigned',
        title: `You have been assigned to ${issue.key}`,
        body: issue.title,
        data: { issueId: id, projectId: issue.projectId },
      });

      // Send issue-assigned email to the new assignee
      this.sendAssigneeEmail(dto.assigneeId, updatedIssue).catch((err) => {
        // Non-blocking: log but don't fail the update
        console.error('Failed to enqueue issue-assigned email:', err.message);
      });
    }

    // Enqueue search index job (update)
    this.enqueueSearchIndex(updatedIssue);

    // Re-generate AI embedding if title or description changed
    if (this.aiService && (dto.title !== undefined || dto.description !== undefined)) {
      this.aiService.enqueueEmbedding(id, organizationId);
    }

    // Resolve new names for relation fields from the re-fetched issue
    const newNames: Record<string, string | null> = {
      statusId: updatedIssue.status?.name || null,
      assigneeId: updatedIssue.assignee?.displayName || null,
      sprintId: updatedIssue.sprint?.name || null,
    };

    // Log activity for each changed field (using human-readable names for relation fields)
    const fieldsToTrack = [
      'title', 'description', 'type', 'priority', 'statusId', 'assigneeId',
      'sprintId', 'dueDate', 'storyPoints', 'timeEstimate',
    ];
    const relationFields = new Set(['statusId', 'assigneeId', 'sprintId']);
    const changes: Record<string, { old: any; new: any }> = {};
    for (const field of fieldsToTrack) {
      if (dto[field] !== undefined && String(dto[field] ?? '') !== String(prevValues[field] ?? '')) {
        let oldVal: string | null;
        let newVal: string | null;
        if (relationFields.has(field)) {
          oldVal = prevNames[field] || null;
          newVal = newNames[field] || null;
        } else if (field === 'description') {
          // Store a short summary instead of raw HTML
          oldVal = prevValues[field] ? 'updated' : null;
          newVal = dto[field] ? 'updated' : null;
        } else {
          oldVal = prevValues[field] != null ? String(prevValues[field]) : null;
          newVal = dto[field] != null ? String(dto[field]) : null;
        }
        changes[field] = { old: oldVal, new: newVal };
        this.activityService.log(organizationId, id, userId, 'updated', field, oldVal, newVal);
      }
    }
    // Handle labels separately (array comparison)
    if (dto.labels !== undefined) {
      const oldLabels = JSON.stringify(prevValues.labels || []);
      const newLabels = JSON.stringify(dto.labels || []);
      if (oldLabels !== newLabels) {
        changes['labels'] = { old: oldLabels, new: newLabels };
        this.activityService.log(organizationId, id, userId, 'updated', 'labels', oldLabels, newLabels);
      }
    }

    // Log audit for update
    if (Object.keys(changes).length > 0) {
      this.auditService.log(organizationId, userId, 'issue.updated', 'issue', id, changes);
    }

    // Trigger automation rules
    if (this.automationEngine) {
      const context = {
        issueId: id,
        userId,
        previousValues: { assigneeId: prevAssigneeId, statusId: prevStatusId, priority: prevPriority },
      };

      // General update trigger
      this.automationEngine.processTrigger(issue.projectId, 'issue.updated', context);

      // Specific triggers for field changes
      if (dto.statusId && dto.statusId !== prevStatusId) {
        this.automationEngine.processTrigger(issue.projectId, 'issue.status_changed', context);
      }
      if (dto.assigneeId && dto.assigneeId !== prevAssigneeId) {
        this.automationEngine.processTrigger(issue.projectId, 'issue.assigned', context);
      }
      if (dto.priority && dto.priority !== prevPriority) {
        this.automationEngine.processTrigger(issue.projectId, 'issue.priority_changed', context);
      }
    }

    return updatedIssue;
  }

  async softDelete(id: string, organizationId: string, userId?: string): Promise<void> {
    const issue = await this.findById(id, organizationId);
    await this.issueRepository.update(id, { deletedAt: new Date() });
    this.eventsGateway.emitToOrg(organizationId, 'issue:deleted', { id });

    this.webhookEventEmitter.emit(
      organizationId,
      issue.projectId,
      WebhookEventType.ISSUE_DELETED,
      { issue: { id: issue.id, key: issue.key, title: issue.title, projectId: issue.projectId } },
    );

    // Enqueue search delete job
    this.enqueueSearchDelete(id);

    // Log audit for deletion
    this.auditService.log(organizationId, userId || null, 'issue.deleted', 'issue', id, {
      key: issue.key,
      title: issue.title,
      projectId: issue.projectId,
    });
  }

  // ── Issue Links ──

  private readonly LINK_TYPE_INVERSES: Record<string, string> = {
    blocks: 'is_blocked_by',
    is_blocked_by: 'blocks',
    duplicates: 'is_duplicated_by',
    is_duplicated_by: 'duplicates',
    relates_to: 'relates_to',
  };

  private readonly LINK_TYPE_LABELS: Record<string, string> = {
    blocks: 'blocks',
    is_blocked_by: 'is blocked by',
    duplicates: 'duplicates',
    is_duplicated_by: 'is duplicated by',
    relates_to: 'relates to',
  };

  async createLink(
    issueId: string,
    organizationId: string,
    dto: CreateIssueLinkDto,
    userId: string,
  ): Promise<IssueLink> {
    await this.findById(issueId, organizationId);
    await this.findById(dto.targetIssueId, organizationId);

    if (issueId === dto.targetIssueId) {
      throw new BadRequestException('Cannot link an issue to itself');
    }

    const link = this.issueLinkRepository.create({
      sourceIssueId: issueId,
      targetIssueId: dto.targetIssueId,
      linkType: dto.linkType,
      createdBy: userId,
    });

    const saved = await this.issueLinkRepository.save(link);
    return this.issueLinkRepository.findOne({
      where: { id: saved.id },
      relations: ['sourceIssue', 'targetIssue'],
    });
  }

  async getLinks(
    issueId: string,
    organizationId: string,
  ): Promise<{ outward: any[]; inward: any[] }> {
    await this.findById(issueId, organizationId);

    const outward = await this.issueLinkRepository.find({
      where: { sourceIssueId: issueId },
      relations: ['targetIssue', 'targetIssue.status'],
    });

    const inward = await this.issueLinkRepository.find({
      where: { targetIssueId: issueId },
      relations: ['sourceIssue', 'sourceIssue.status'],
    });

    return {
      outward: outward.map((l) => ({
        id: l.id,
        linkType: l.linkType,
        label: this.LINK_TYPE_LABELS[l.linkType] || l.linkType,
        issue: l.targetIssue,
      })),
      inward: inward.map((l) => ({
        id: l.id,
        linkType: this.LINK_TYPE_INVERSES[l.linkType] || l.linkType,
        label: this.LINK_TYPE_LABELS[this.LINK_TYPE_INVERSES[l.linkType] || l.linkType] || l.linkType,
        issue: l.sourceIssue,
      })),
    };
  }

  async deleteLink(
    issueId: string,
    linkId: string,
    organizationId: string,
  ): Promise<void> {
    await this.findById(issueId, organizationId);
    const link = await this.issueLinkRepository.findOne({
      where: { id: linkId },
    });
    if (!link) {
      throw new NotFoundException('Link not found');
    }
    if (link.sourceIssueId !== issueId && link.targetIssueId !== issueId) {
      throw new NotFoundException('Link not found for this issue');
    }
    await this.issueLinkRepository.delete(linkId);
  }

  // ── Issue Watchers ──

  private async addWatcherSilent(issueId: string, userId: string): Promise<void> {
    try {
      await this.issueWatcherRepository.save(
        this.issueWatcherRepository.create({ issueId, userId }),
      );
    } catch {
      // Ignore duplicate key errors
    }
  }

  async toggleWatch(
    issueId: string,
    organizationId: string,
    userId: string,
  ): Promise<{ watching: boolean; watcherCount: number }> {
    await this.findById(issueId, organizationId);

    const existing = await this.issueWatcherRepository.findOne({
      where: { issueId, userId },
    });

    if (existing) {
      await this.issueWatcherRepository.delete({ issueId, userId });
    } else {
      await this.issueWatcherRepository.save(
        this.issueWatcherRepository.create({ issueId, userId }),
      );
    }

    const watcherCount = await this.issueWatcherRepository.count({
      where: { issueId },
    });

    return { watching: !existing, watcherCount };
  }

  async getWatchers(
    issueId: string,
    organizationId: string,
  ): Promise<{ watchers: any[]; count: number }> {
    await this.findById(issueId, organizationId);

    const watchers = await this.issueWatcherRepository.find({
      where: { issueId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });

    return {
      watchers: watchers.map((w) => ({
        userId: w.userId,
        displayName: w.user?.displayName,
        avatarUrl: w.user?.avatarUrl,
        email: w.user?.email,
        createdAt: w.createdAt,
      })),
      count: watchers.length,
    };
  }

  async isWatching(issueId: string, userId: string): Promise<boolean> {
    const count = await this.issueWatcherRepository.count({
      where: { issueId, userId },
    });
    return count > 0;
  }

  async getChildren(parentId: string, organizationId: string): Promise<Issue[]> {
    return this.issueRepository.find({
      where: { parentId, organizationId, deletedAt: IsNull() },
      relations: ['status', 'assignee'],
      order: { position: 'ASC' },
    });
  }

  async createWorkLog(issueId: string, organizationId: string, dto: CreateWorkLogDto, userId: string): Promise<WorkLog> {
    const issue = await this.findById(issueId, organizationId);

    const workLog = this.workLogRepository.create({
      issueId,
      userId,
      timeSpent: dto.timeSpent,
      description: dto.description,
      loggedAt: dto.loggedAt ? new Date(dto.loggedAt) : new Date(),
    });
    const saved = await this.workLogRepository.save(workLog);

    const newTimeSpent = (issue.timeSpent || 0) + dto.timeSpent;

    // FR-TIME-006: Auto-calculate remaining estimate
    const updatePayload: Partial<Issue> = { timeSpent: newTimeSpent };
    if (issue.timeEstimate != null) {
      const remaining = issue.timeEstimate - newTimeSpent;
      updatePayload.timeEstimate = Math.max(remaining, 0);
    }

    await this.issueRepository.update(issueId, updatePayload);

    // Log activity for work log
    this.activityService.log(
      issue.organizationId,
      issueId,
      userId,
      'work_logged',
      'timeSpent',
      null,
      String(dto.timeSpent),
      { description: dto.description },
    );

    return saved;
  }

  async getWorkLogs(issueId: string, organizationId: string): Promise<WorkLog[]> {
    await this.findById(issueId, organizationId);
    return this.workLogRepository.find({
      where: { issueId },
      relations: ['user'],
      order: { loggedAt: 'DESC' },
    });
  }

  async bulkUpdate(organizationId: string, dto: BulkUpdateIssuesDto): Promise<{ affected: number }> {
    if (!dto.issueIds || dto.issueIds.length === 0) {
      throw new BadRequestException('issueIds must not be empty');
    }

    const updateFields: Partial<Issue> = {};
    if (dto.assigneeId !== undefined) updateFields.assigneeId = dto.assigneeId;
    if (dto.statusId !== undefined) updateFields.statusId = dto.statusId;
    if (dto.sprintId !== undefined) updateFields.sprintId = dto.sprintId;
    if (dto.type !== undefined) updateFields.type = dto.type;
    if (dto.priority !== undefined) updateFields.priority = dto.priority;
    if (dto.labels !== undefined) updateFields.labels = dto.labels;
    if (dto.storyPoints !== undefined) updateFields.storyPoints = dto.storyPoints;

    if (Object.keys(updateFields).length === 0) {
      throw new BadRequestException('At least one field to update must be provided');
    }

    const result = await this.issueRepository
      .createQueryBuilder()
      .update(Issue)
      .set(updateFields)
      .where('id IN (:...ids)', { ids: dto.issueIds })
      .andWhere('organization_id = :organizationId', { organizationId })
      .andWhere('deleted_at IS NULL')
      .execute();

    this.eventsGateway.emitToOrg(organizationId, 'issues:bulk-updated', {
      issueIds: dto.issueIds,
    });

    return { affected: result.affected || 0 };
  }

  async bulkMove(organizationId: string, dto: BulkMoveIssuesDto): Promise<{ affected: number }> {
    if (!dto.issueIds || dto.issueIds.length === 0) {
      throw new BadRequestException('issueIds must not be empty');
    }

    const targetProject = await this.projectsService.findById(dto.targetProjectId, organizationId);

    let targetStatusId = dto.targetStatusId;
    if (!targetStatusId) {
      const defaultStatus = await this.issueStatusRepository.findOne({
        where: { projectId: dto.targetProjectId, isDefault: true },
        order: { position: 'ASC' },
      });
      if (defaultStatus) {
        targetStatusId = defaultStatus.id;
      } else {
        const firstStatus = await this.issueStatusRepository.findOne({
          where: { projectId: dto.targetProjectId },
          order: { position: 'ASC' },
        });
        if (firstStatus) targetStatusId = firstStatus.id;
      }
    }

    // Re-key each issue with the target project's key prefix
    const issues = await this.issueRepository.find({
      where: { id: In(dto.issueIds), organizationId, deletedAt: IsNull() },
    });

    const affected = issues.length;
    if (affected === 0) {
      this.eventsGateway.emitToOrg(organizationId, 'issues:bulk-moved', {
        issueIds: dto.issueIds,
        targetProjectId: dto.targetProjectId,
      });
      return { affected };
    }

    // Reserve a consecutive block of issue numbers atomically (2 DB round trips total)
    const { rows } = await this.issueRepository.query(
      `UPDATE projects
       SET next_issue_number = next_issue_number + $1
       WHERE id = $2
       RETURNING next_issue_number - $1 AS first_number`,
      [affected, dto.targetProjectId],
    );
    const firstNumber: number = Number(rows[0].first_number);

    // Build a single bulk UPDATE assigning new keys and moving issues
    const valuesList = issues
      .map((_, i) => `($${i * 3 + 1}::uuid, $${i * 3 + 2}::varchar, $${i * 3 + 3}::int)`)
      .join(', ');
    const bulkParams = issues.flatMap((issue, i) => {
      const issueNumber = firstNumber + i;
      const newKey = `${targetProject.key}-${issueNumber}`;
      return [issue.id, newKey, issueNumber];
    });

    await this.issueRepository.query(
      `UPDATE issues SET
         project_id = $${bulkParams.length + 1},
         key = v.new_key,
         number = v.new_number,
         status_id = COALESCE($${bulkParams.length + 2}, status_id),
         sprint_id = NULL,
         updated_at = NOW()
       FROM (VALUES ${valuesList}) AS v(id, new_key, new_number)
       WHERE issues.id = v.id AND issues.organization_id = $${bulkParams.length + 3}`,
      [...bulkParams, dto.targetProjectId, targetStatusId ?? null, organizationId],
    );

    this.eventsGateway.emitToOrg(organizationId, 'issues:bulk-moved', {
      issueIds: dto.issueIds,
      targetProjectId: dto.targetProjectId,
    });

    return { affected };
  }

  async bulkDelete(organizationId: string, dto: BulkDeleteIssuesDto): Promise<{ affected: number }> {
    if (!dto.issueIds || dto.issueIds.length === 0) {
      throw new BadRequestException('issueIds must not be empty');
    }

    const result = await this.issueRepository
      .createQueryBuilder()
      .update(Issue)
      .set({ deletedAt: new Date() })
      .where('id IN (:...ids)', { ids: dto.issueIds })
      .andWhere('organization_id = :organizationId', { organizationId })
      .andWhere('deleted_at IS NULL')
      .execute();

    this.eventsGateway.emitToOrg(organizationId, 'issues:bulk-deleted', {
      issueIds: dto.issueIds,
    });

    return { affected: result.affected || 0 };
  }

  async bulkRestore(organizationId: string, issueIds: string[]): Promise<{ affected: number }> {
    if (!issueIds || issueIds.length === 0) {
      throw new BadRequestException('issueIds must not be empty');
    }

    const result = await this.issueRepository
      .createQueryBuilder()
      .update(Issue)
      .set({ deletedAt: null as any })
      .where('id IN (:...ids)', { ids: issueIds })
      .andWhere('organization_id = :organizationId', { organizationId })
      .andWhere('deleted_at IS NOT NULL')
      .execute();

    this.eventsGateway.emitToOrg(organizationId, 'issues:bulk-restored', {
      issueIds,
    });

    return { affected: result.affected || 0 };
  }

  async bulkTransition(organizationId: string, dto: BulkTransitionIssuesDto): Promise<{ affected: number }> {
    if (!dto.issueIds || dto.issueIds.length === 0) {
      throw new BadRequestException('issueIds must not be empty');
    }

    const result = await this.issueRepository
      .createQueryBuilder()
      .update(Issue)
      .set({ statusId: dto.statusId })
      .where('id IN (:...ids)', { ids: dto.issueIds })
      .andWhere('organization_id = :organizationId', { organizationId })
      .andWhere('deleted_at IS NULL')
      .execute();

    this.eventsGateway.emitToOrg(organizationId, 'issues:bulk-transitioned', {
      issueIds: dto.issueIds,
      statusId: dto.statusId,
    });

    return { affected: result.affected || 0 };
  }

  /**
   * Send an issue-assigned email to the given user.
   * Looks up the user and project to fill in the email template fields.
   */
  private async sendAssigneeEmail(assigneeId: string, issue: Issue): Promise<void> {
    const assignee = await this.usersService.findById(assigneeId);
    const projectName = issue.project?.name || 'Unknown Project';
    const frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3000';
    const issueUrl = `${frontendUrl}/issues/${issue.id}`;

    await this.emailService.sendIssueAssignedEmail(
      assignee.email,
      assignee.displayName,
      issue.key,
      issue.title,
      projectName,
      issueUrl,
    );
  }
}
