import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sprint } from './entities/sprint.entity';
import { Issue } from '../issues/entities/issue.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class SprintsService {
  constructor(
    @InjectRepository(Sprint)
    private sprintRepository: Repository<Sprint>,
    @InjectRepository(Issue)
    private issueRepository: Repository<Issue>,
    @InjectRepository(IssueStatus)
    private issueStatusRepository: Repository<IssueStatus>,
    private projectsService: ProjectsService,
  ) {}

  async findAll(projectId: string, organizationId: string): Promise<Sprint[]> {
    await this.projectsService.findById(projectId, organizationId);
    return this.sprintRepository.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
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

  async start(id: string, organizationId: string): Promise<Sprint> {
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
    if (!sprint.startDate) {
      sprint.startDate = new Date().toISOString().split('T')[0];
    }
    return this.sprintRepository.save(sprint);
  }

  async complete(id: string, organizationId: string): Promise<Sprint> {
    const sprint = await this.findById(id);
    await this.projectsService.findById(sprint.projectId, organizationId);

    if (sprint.status !== 'active') {
      throw new BadRequestException('Only active sprints can be completed');
    }

    const doneStatuses = await this.issueStatusRepository.find({
      where: { projectId: sprint.projectId, category: 'done' },
    });
    const doneStatusIds = doneStatuses.map((s) => s.id);

    const incompleteIssues = await this.issueRepository
      .createQueryBuilder('issue')
      .where('issue.sprint_id = :sprintId', { sprintId: id })
      .andWhere('issue.deleted_at IS NULL')
      .andWhere(doneStatusIds.length > 0 ? 'issue.status_id NOT IN (:...doneStatusIds)' : '1=1', { doneStatusIds })
      .getMany();

    if (incompleteIssues.length > 0) {
      await this.issueRepository
        .createQueryBuilder()
        .update()
        .set({ sprintId: null })
        .where('sprint_id = :sprintId', { sprintId: id })
        .andWhere('deleted_at IS NULL')
        .andWhere(doneStatusIds.length > 0 ? 'status_id NOT IN (:...doneStatusIds)' : '1=1', { doneStatusIds })
        .execute();
    }

    sprint.status = 'completed';
    sprint.completedAt = new Date();
    return this.sprintRepository.save(sprint);
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
}
