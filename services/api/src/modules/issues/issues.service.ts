import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Issue } from './entities/issue.entity';
import { IssueStatus } from './entities/issue-status.entity';
import { WorkLog } from './entities/work-log.entity';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { CreateWorkLogDto } from './dto/create-work-log.dto';
import { ProjectsService } from '../projects/projects.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../../websocket/events.gateway';

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
    private eventsGateway: EventsGateway,
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
  }) {
    const { organizationId, projectId, sprintId, assigneeId, type, priority, statusId, search, page = 1, limit = 20, backlog } = filters;

    const qb = this.issueRepository
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.status', 'status')
      .leftJoinAndSelect('issue.assignee', 'assignee')
      .leftJoinAndSelect('issue.reporter', 'reporter')
      .leftJoinAndSelect('issue.sprint', 'sprint')
      .where('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL');

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

    if (dto.assigneeId && dto.assigneeId !== userId) {
      await this.notificationsService.create({
        userId: dto.assigneeId,
        type: 'issue:assigned',
        title: `You have been assigned to ${key}`,
        body: dto.title,
        data: { issueId: saved.id, projectId: dto.projectId },
      });
    }

    return fullIssue;
  }

  async update(id: string, organizationId: string, dto: UpdateIssueDto, userId: string): Promise<Issue> {
    const issue = await this.findById(id, organizationId);
    const prevAssigneeId = issue.assigneeId;

    Object.assign(issue, dto);
    await this.issueRepository.save(issue);

    const updatedIssue = await this.findById(id, organizationId);
    this.eventsGateway.emitToOrg(organizationId, 'issue:updated', updatedIssue);

    if (dto.assigneeId && dto.assigneeId !== prevAssigneeId && dto.assigneeId !== userId) {
      await this.notificationsService.create({
        userId: dto.assigneeId,
        type: 'issue:assigned',
        title: `You have been assigned to ${issue.key}`,
        body: issue.title,
        data: { issueId: id, projectId: issue.projectId },
      });
    }

    return updatedIssue;
  }

  async softDelete(id: string, organizationId: string): Promise<void> {
    const issue = await this.findById(id, organizationId);
    await this.issueRepository.update(id, { deletedAt: new Date() });
    this.eventsGateway.emitToOrg(organizationId, 'issue:deleted', { id });
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

    await this.issueRepository.update(issueId, {
      timeSpent: (issue.timeSpent || 0) + dto.timeSpent,
    });

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
}
