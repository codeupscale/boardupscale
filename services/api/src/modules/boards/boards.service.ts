import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { Issue } from '../issues/entities/issue.entity';
import { CreateStatusDto } from './dto/create-status.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
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

  /** Applies shared filter predicates to an issue query builder. */
  private applyBoardFilters(
    qb: SelectQueryBuilder<Issue>,
    query?: BoardQueryDto,
  ): void {
    if (query?.assigneeId) {
      qb.andWhere('issue.assigneeId = :assigneeId', { assigneeId: query.assigneeId });
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
      qb.andWhere('(issue.title ILIKE :search OR issue.key ILIKE :search)', { search: `%${query.search}%` });
    }
    if (query?.sprintId) {
      if (query.sprintId === 'backlog') {
        qb.andWhere('issue.sprintId IS NULL');
      } else {
        qb.andWhere('issue.sprintId = :sprintId', { sprintId: query.sprintId });
      }
    }

    // Hide child issues from the board — they should only appear in the backlog
    qb.andWhere('issue.parentId IS NULL');
  }

  async getBoardData(projectId: string, organizationId: string, query?: BoardQueryDto) {
    await this.projectsService.findById(projectId, organizationId);

    const columnLimit = query?.columnLimit ?? 50;

    const statuses = await this.issueStatusRepository.find({
      where: { projectId },
      order: { position: 'ASC' },
    });

    if (statuses.length === 0) {
      return [];
    }

    // Fetch enough issues to fill all columns up to columnLimit each
    const qb = this.issueRepository
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.assignee', 'assignee')
      .leftJoinAndSelect('issue.status', 'status')
      .leftJoinAndSelect('issue.reporter', 'reporter')
      .where('issue.projectId = :projectId', { projectId })
      .andWhere('issue.deletedAt IS NULL');

    this.applyBoardFilters(qb, query);
    qb.orderBy('issue.position', 'ASC');

    const allIssues = await qb
      .take(columnLimit * statuses.length + statuses.length)
      .getMany();

    // Group by status, capped at columnLimit per column
    const issuesByStatus: Record<string, Issue[]> = {};
    for (const issue of allIssues) {
      if (!issuesByStatus[issue.statusId]) issuesByStatus[issue.statusId] = [];
      if (issuesByStatus[issue.statusId].length < columnLimit) {
        issuesByStatus[issue.statusId].push(issue);
      }
    }

    // Count totals per column (same filters, grouped by statusId)
    const countQb = this.issueRepository
      .createQueryBuilder('issue')
      .select('issue.statusId', 'statusId')
      .addSelect('COUNT(*)', 'total')
      .where('issue.projectId = :projectId', { projectId })
      .andWhere('issue.deletedAt IS NULL');

    this.applyBoardFilters(countQb, query);
    countQb.groupBy('issue.statusId');

    const countRows: Array<{ statusId: string; total: string }> =
      await countQb.getRawMany();

    const totalByStatus: Record<string, number> = {};
    for (const row of countRows) {
      totalByStatus[row.statusId] = parseInt(row.total, 10);
    }

    return statuses.map((status) => ({
      ...status,
      issues: issuesByStatus[status.id] ?? [],
      total: totalByStatus[status.id] ?? 0,
      hasMore: (totalByStatus[status.id] ?? 0) > columnLimit,
    }));
  }

  async getColumnIssues(
    projectId: string,
    statusId: string,
    organizationId: string,
    query: BoardQueryDto,
    offset = 0,
  ) {
    await this.projectsService.findById(projectId, organizationId);

    const limit = query?.columnLimit ?? 50;

    const qb = this.issueRepository
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.assignee', 'assignee')
      .leftJoinAndSelect('issue.status', 'status')
      .leftJoinAndSelect('issue.reporter', 'reporter')
      .where('issue.projectId = :projectId', { projectId })
      .andWhere('issue.statusId = :statusId', { statusId })
      .andWhere('issue.deletedAt IS NULL');

    this.applyBoardFilters(qb, query);
    qb.orderBy('issue.position', 'ASC').skip(offset).take(limit);

    const [issues, total] = await qb.getManyAndCount();

    return { issues, total, offset, limit, hasMore: offset + issues.length < total };
  }

  async createStatus(projectId: string, organizationId: string, dto: CreateStatusDto): Promise<IssueStatus> {
    await this.projectsService.findById(projectId, organizationId);

    let position = dto.position;
    if (position === undefined) {
      const maxPosition = await this.issueStatusRepository
        .createQueryBuilder('s')
        .where('s.projectId = :projectId', { projectId })
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
    dto: UpdateStatusDto,
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
      .where('statusId = :statusId', { statusId })
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
          .where('issue.statusId = :statusId', { statusId })
          .andWhere('issue.projectId = :projectId', { projectId })
          .andWhere('issue.deletedAt IS NULL')
          .getCount();

        // Count how many issues are being moved OUT of this status
        const movingOutCount = dto.items.filter(
          (item) => item.statusId !== statusId,
        ).length;

        // The issues moving into this column that aren't already there
        const existingInTarget = await this.issueRepository
          .createQueryBuilder('issue')
          .where('issue.statusId = :statusId', { statusId })
          .andWhere('issue.id IN (:...ids)', { ids: issueIdsMoving.length > 0 ? issueIdsMoving : ['00000000-0000-0000-0000-000000000000'] })
          .andWhere('issue.deletedAt IS NULL')
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

    // Single bulk UPDATE using VALUES list — avoids N individual round trips
    const values = dto.items
      .map((_, i) => `($${i * 3 + 1}::uuid, $${i * 3 + 2}::uuid, $${i * 3 + 3}::float)`)
      .join(', ');
    const params = dto.items.flatMap((item) => [item.issueId, item.statusId, item.position]);
    await this.issueRepository.query(
      `UPDATE issues SET status_id = v.status_id, position = v.position, updated_at = NOW()
       FROM (VALUES ${values}) AS v(id, status_id, position)
       WHERE issues.id = v.id AND issues.organization_id = $${params.length + 1}`,
      [...params, organizationId],
    );
  }
}
