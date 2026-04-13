import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sprint } from './entities/sprint.entity';
import { Issue } from '../issues/entities/issue.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { ProjectsService } from '../projects/projects.service';
import { EmailService } from '../notifications/email.service';
import { WebhookEventEmitter } from '../webhooks/webhook-event-emitter.service';
import { WebhookEventType } from '../webhooks/webhook-events.constants';
import { AutomationEngineService } from '../automation/automation-engine.service';
import { EventsGateway } from '../../websocket/events.gateway';

@Injectable()
export class SprintsService {
  private readonly logger = new Logger(SprintsService.name);

  constructor(
    @InjectRepository(Sprint)
    private sprintRepository: Repository<Sprint>,
    @InjectRepository(Issue)
    private issueRepository: Repository<Issue>,
    @InjectRepository(IssueStatus)
    private issueStatusRepository: Repository<IssueStatus>,
    private projectsService: ProjectsService,
    private emailService: EmailService,
    private webhookEventEmitter: WebhookEventEmitter,
    private eventsGateway: EventsGateway,
    @Optional() @Inject(AutomationEngineService)
    private automationEngine?: AutomationEngineService,
  ) {}

  async findAll(projectId: string, organizationId: string): Promise<Sprint[]> {
    await this.projectsService.findById(projectId, organizationId);
    return this.sprintRepository.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async findById(id: string): Promise<Sprint> {
    const sprint = await this.sprintRepository.findOne({
      where: { id },
      relations: ['project'],
    });
    if (!sprint) {
      throw new NotFoundException('Sprint not found');
    }
    return sprint;
  }

  async create(dto: CreateSprintDto, organizationId: string): Promise<Sprint> {
    await this.projectsService.findById(dto.projectId, organizationId);

    const sprint = this.sprintRepository.create({
      ...dto,
      status: 'planned',
    });
    return this.sprintRepository.save(sprint);
  }

  async update(id: string, organizationId: string, dto: UpdateSprintDto): Promise<Sprint> {
    const sprint = await this.findById(id);
    await this.projectsService.findById(sprint.projectId, organizationId);

    Object.assign(sprint, dto);
    return this.sprintRepository.save(sprint);
  }

  async start(id: string, organizationId: string, dto?: { startDate?: string; endDate?: string }): Promise<Sprint> {
    const sprint = await this.findById(id);
    await this.projectsService.findById(sprint.projectId, organizationId);

    if (sprint.status !== 'planned') {
      throw new BadRequestException('Only planned sprints can be started');
    }

    const activeSprint = await this.sprintRepository.findOne({
      where: { projectId: sprint.projectId, status: 'active' },
    });
    if (activeSprint) {
      throw new BadRequestException('There is already an active sprint in this project. Complete it before starting a new one.');
    }

    sprint.status = 'active';
    if (dto?.startDate) {
      sprint.startDate = dto.startDate;
    } else if (!sprint.startDate) {
      sprint.startDate = new Date().toISOString().split('T')[0];
    }
    if (dto?.endDate) {
      sprint.endDate = dto.endDate;
    }
    const saved = await this.sprintRepository.save(sprint);

    this.webhookEventEmitter.emit(
      organizationId,
      sprint.projectId,
      WebhookEventType.SPRINT_STARTED,
      { sprint: saved, projectId: sprint.projectId },
    );

    // Send sprint reminder emails to all project members
    this.sendSprintReminderEmails(sprint, organizationId).catch((err) =>
      this.logger.error('Failed to send sprint reminder emails:', err.message),
    );

    // Trigger automation rules
    if (this.automationEngine) {
      this.automationEngine.processTrigger(sprint.projectId, 'sprint.started', {
        sprintId: id,
      });
    }

    return saved;
  }

  async complete(id: string, organizationId: string, moveToSprintId?: string): Promise<Sprint> {
    const sprint = await this.findById(id);
    await this.projectsService.findById(sprint.projectId, organizationId);

    if (sprint.status !== 'active') {
      throw new BadRequestException('Only active sprints can be completed');
    }

    // Validate the target sprint if one was provided
    if (moveToSprintId) {
      const targetSprint = await this.sprintRepository.findOne({ where: { id: moveToSprintId } });
      if (!targetSprint) throw new BadRequestException('Target sprint not found');
      if (targetSprint.projectId !== sprint.projectId) throw new BadRequestException('Target sprint must be in the same project');
      if (targetSprint.id === id) throw new BadRequestException('Cannot move issues to the sprint being completed');
      if (targetSprint.status === 'completed') throw new BadRequestException('Cannot move issues to a completed sprint');
    }

    const doneStatuses = await this.issueStatusRepository.find({
      where: { projectId: sprint.projectId, category: 'done' },
    });
    const doneStatusIds = doneStatuses.map((s) => s.id);

    // Only move incomplete issues when we can reliably identify done vs not-done.
    // If the project has no done-category statuses configured, leave all issues
    // linked to the sprint rather than incorrectly moving everything to backlog.
    let incompleteIssueCount = 0;
    if (doneStatusIds.length > 0) {
      const incompleteIssues = await this.issueRepository
        .createQueryBuilder('issue')
        .where('issue.sprint_id = :sprintId', { sprintId: id })
        .andWhere('issue.deleted_at IS NULL')
        .andWhere('issue.status_id NOT IN (:...doneStatusIds)', { doneStatusIds })
        .getMany();

      incompleteIssueCount = incompleteIssues.length;

      if (incompleteIssues.length > 0) {
        await this.issueRepository
          .createQueryBuilder()
          .update()
          // Move to the chosen sprint, or null out to backlog if no target was chosen
          .set({ sprintId: moveToSprintId ?? null })
          .where('id IN (:...ids)', { ids: incompleteIssues.map((i) => i.id) })
          .execute();

        // Notify all connected clients that these issues changed so open detail
        // pages refresh their sprint field without requiring a manual page reload.
        for (const issue of incompleteIssues) {
          this.eventsGateway.emitToOrg(organizationId, 'issue:updated', {
            ...issue,
            sprintId: moveToSprintId ?? null,
            sprint: null,
          });
        }
      }
    }

    sprint.status = 'completed';
    sprint.completedAt = new Date();
    const saved = await this.sprintRepository.save(sprint);

    this.webhookEventEmitter.emit(
      organizationId,
      sprint.projectId,
      WebhookEventType.SPRINT_COMPLETED,
      { sprint: saved, projectId: sprint.projectId, incompleteIssueCount },
    );

    // Trigger automation rules
    if (this.automationEngine) {
      this.automationEngine.processTrigger(sprint.projectId, 'sprint.completed', {
        sprintId: id,
      });
    }

    return saved;
  }

  async delete(id: string, organizationId: string): Promise<void> {
    const sprint = await this.findById(id);
    await this.projectsService.findById(sprint.projectId, organizationId);

    if (sprint.status === 'active') {
      throw new BadRequestException('Cannot delete an active sprint. Complete it first.');
    }

    await this.issueRepository
      .createQueryBuilder()
      .update()
      .set({ sprintId: null })
      .where('sprint_id = :sprintId', { sprintId: id })
      .execute();

    await this.sprintRepository.remove(sprint);
  }

  /**
   * Send sprint reminder emails to all members of the project.
   */
  private async sendSprintReminderEmails(
    sprint: Sprint,
    organizationId: string,
  ): Promise<void> {
    const members = await this.projectsService.getMembers(
      sprint.projectId,
      organizationId,
    );
    const projectName = sprint.project?.name || 'Unknown Project';
    const endDate = sprint.endDate || new Date().toISOString();

    for (const member of members) {
      if (!member.user) continue;
      try {
        await this.emailService.sendSprintReminderEmail(
          member.user.email,
          member.user.displayName,
          sprint.name,
          endDate,
          projectName,
        );
      } catch (err) {
        this.logger.error(
          `Failed to send sprint reminder to ${member.user.email}:`,
          err.message,
        );
      }
    }
  }
}
