import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, SelectQueryBuilder } from 'typeorm';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { Issue } from '../issues/entities/issue.entity';
import { CreateStatusDto } from './dto/create-status.dto';
import { ReorderIssuesDto } from './dto/reorder-issues.dto';
import { BoardQueryDto } from './dto/board-query.dto';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class BoardsService {
  constructor(
    @InjectRepository(IssueStatus)
    private issueStatusRepository: Repository<IssueStatus>,
    @InjectRepository(Issue)
    private issueRepository: Repository<Issue>,
    private projectsService: ProjectsService,
  ) {}

  async getBoardData(projectId: string, organizationId: string, query?: BoardQueryDto) {
    await this.projectsService.findById(projectId, organizationId);

    const statuses = await this.issueStatusRepository.find({
      where: { projectId },
      order: { position: 'ASC' },
    });

    // Build issue query with optional filters
    const qb: SelectQueryBuilder<Issue> = this.issueRepository
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.assignee', 'assignee')
      .leftJoinAndSelect('issue.status', 'status')
      .leftJoinAndSelect('issue.reporter', 'reporter')
      .where('issue.project_id = :projectId', { projectId })
      .andWhere('issue.deleted_at IS NULL');

    if (query?.assigneeId) {
      qb.andWhere('issue.assignee_id = :assigneeId', { assigneeId: query.assigneeId });
    }

    if (query?.type) {
      qb.andWhere('issue.type = :type', { type: query.type });
    }

    if (query?.priority) {
      qb.andWhere('issue.priority = :priority', { priority: query.priority });
    }

    if (query?.label) {
      qb.andWhere(':label = ANY(issue.labels)', { label: query.label });
    }

    if (query?.search) {
      qb.andWhere('issue.title ILIKE :search', { search: `%${query.search}%` });
    }

    if (query?.sprintId) {
      if (query.sprintId === 'backlog') {
        qb.andWhere('issue.sprint_id IS NULL');
      } else {
        qb.andWhere('issue.sprint_id = :sprintId', { sprintId: query.sprintId });
      }
    }

    qb.orderBy('issue.position', 'ASC');

    const issues = await qb.getMany();

    const board = statuses.map((status) => ({
      ...status,
      issues: issues.filter((issue) => issue.statusId === status.id),
    }));

    return board;
  }

  async createStatus(projectId: string, organizationId: string, dto: CreateStatusDto): Promise<IssueStatus> {
    await this.projectsService.findById(projectId, organizationId);

    let position = dto.position;
    if (position === undefined) {
      const maxPosition = await this.issueStatusRepository
        .createQueryBuilder('s')
        .where('s.project_id = :projectId', { projectId })
        .select('MAX(s.position)', 'max')
        .getRawOne();
      position = (maxPosition?.max ?? -1) + 1;
    }

    const status = this.issueStatusRepository.create({
      ...dto,
      projectId,
      position,
    });
    return this.issueStatusRepository.save(status);
  }

  async updateStatus(
    projectId: string,
    statusId: string,
    organizationId: string,
    dto: Partial<CreateStatusDto>,
  ): Promise<IssueStatus> {
    await this.projectsService.findById(projectId, organizationId);

    const status = await this.issueStatusRepository.findOne({
      where: { id: statusId, projectId },
    });
    if (!status) {
      throw new NotFoundException('Status not found');
    }

    Object.assign(status, dto);
    return this.issueStatusRepository.save(status);
  }

  async deleteStatus(projectId: string, statusId: string, organizationId: string): Promise<void> {
    await this.projectsService.findById(projectId, organizationId);

    const status = await this.issueStatusRepository.findOne({
      where: { id: statusId, projectId },
    });
    if (!status) {
      throw new NotFoundException('Status not found');
    }

    const statuses = await this.issueStatusRepository.find({
      where: { projectId },
      order: { position: 'ASC' },
    });

    if (statuses.length <= 1) {
      throw new BadRequestException('Cannot delete the last status column');
    }

    const fallbackStatus = statuses.find((s) => s.id !== statusId);

    await this.issueRepository
      .createQueryBuilder()
      .update()
      .set({ statusId: fallbackStatus.id })
      .where('status_id = :statusId', { statusId })
      .execute();

    await this.issueStatusRepository.remove(status);
  }

  async reorderIssues(projectId: string, organizationId: string, dto: ReorderIssuesDto): Promise<void> {
    await this.projectsService.findById(projectId, organizationId);

    // Check WIP limits for each target status
    const targetStatusIds = [...new Set(dto.items.map((item) => item.statusId))];

    for (const statusId of targetStatusIds) {
      const status = await this.issueStatusRepository.findOne({
        where: { id: statusId, projectId },
      });

      if (!status) {
        throw new NotFoundException(`Status ${statusId} not found`);
      }

      if (status.wipLimit > 0) {
        // Count how many issues will end up in this status after the reorder
        const issuesMovingToStatus = dto.items.filter((item) => item.statusId === statusId);
        const issueIdsMoving = issuesMovingToStatus.map((item) => item.issueId);

        // Count existing issues in this status that are NOT being moved
        const currentCount = await this.issueRepository
          .createQueryBuilder('issue')
          .where('issue.status_id = :statusId', { statusId })
          .andWhere('issue.project_id = :projectId', { projectId })
          .andWhere('issue.deleted_at IS NULL')
          .getCount();

        // Count how many issues are being moved OUT of this status
        const movingOutCount = dto.items.filter(
          (item) => item.statusId !== statusId,
        ).length;

        // The issues moving into this column that aren't already there
        const existingInTarget = await this.issueRepository
          .createQueryBuilder('issue')
          .where('issue.status_id = :statusId', { statusId })
          .andWhere('issue.id IN (:...ids)', { ids: issueIdsMoving.length > 0 ? issueIdsMoving : ['00000000-0000-0000-0000-000000000000'] })
          .andWhere('issue.deleted_at IS NULL')
          .getCount();

        const newIssuesCount = issuesMovingToStatus.length - existingInTarget;
        const finalCount = currentCount + newIssuesCount;

        if (finalCount > status.wipLimit) {
          throw new BadRequestException(
            `WIP limit exceeded for "${status.name}". Limit: ${status.wipLimit}, would have: ${finalCount}`,
          );
        }
      }
    }

    const updates = dto.items.map((item) =>
      this.issueRepository.update(item.issueId, {
        statusId: item.statusId,
        position: item.position,
      }),
    );

    await Promise.all(updates);
  }
}
