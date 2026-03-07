import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, IsNull, In, Not } from 'typeorm';
import { Issue } from './entities/issue.entity';
import { IssueStatus } from './entities/issue-status.entity';
import { WorkLog } from './entities/work-log.entity';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { CreateWorkLogDto } from './dto/create-work-log.dto';
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

@Injectable()
export class IssuesService {
  constructor(
    @InjectRepository(Issue)
    private issueRepository: Repository<Issue>,
    @InjectRepository(IssueStatus)
    private issueStatusRepository: Repository<IssueStatus>,
    @InjectRepository(WorkLog)
    private workLogRepository: Repository<WorkLog>,
    private projectsService: ProjectsService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
    private usersService: UsersService,
    private configService: ConfigService,
    private eventsGateway: EventsGateway,
    private webhookEventEmitter: WebhookEventEmitter,
    @Optional() @Inject(AutomationEngineService)
    private automationEngine?: AutomationEngineService,
  ) {}

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
      .leftJoinAndSelect('issue.assignee', 'assignee')
      .leftJoinAndSelect('issue.reporter', 'reporter')
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
      relations: ['status', 'assignee', 'reporter', 'sprint', 'parent', 'project'],
    });
    if (!issue) {
      throw new NotFoundException('Issue not found');
    }
    return issue;
  }

  async create(dto: CreateIssueDto, organizationId: string, userId: string): Promise<Issue> {
    const project = await this.projectsService.findById(dto.projectId, organizationId);

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
    }

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

    Object.assign(issue, dto);
    await this.issueRepository.save(issue);

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

  async softDelete(id: string, organizationId: string): Promise<void> {
    const issue = await this.findById(id, organizationId);
    await this.issueRepository.update(id, { deletedAt: new Date() });
    this.eventsGateway.emitToOrg(organizationId, 'issue:deleted', { id });

    this.webhookEventEmitter.emit(
      organizationId,
      issue.projectId,
      WebhookEventType.ISSUE_DELETED,
      { issue: { id: issue.id, key: issue.key, title: issue.title, projectId: issue.projectId } },
    );
  }

  async addWatcher(id: string, organizationId: string, userId: string): Promise<Issue> {
    // Watchers stored as notification preferences; simply return the issue
    return this.findById(id, organizationId);
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

    let affected = 0;
    for (const issue of issues) {
      const issueNumber = await this.projectsService.getNextIssueNumber(dto.targetProjectId);
      const newKey = `${targetProject.key}-${issueNumber}`;
      await this.issueRepository.update(issue.id, {
        projectId: dto.targetProjectId,
        key: newKey,
        number: issueNumber,
        statusId: targetStatusId || issue.statusId,
        sprintId: null as any, // Clear sprint when moving projects
      });
      affected++;
    }

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
