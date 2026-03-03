import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { Issue } from '../issues/entities/issue.entity';
import { CreateStatusDto } from './dto/create-status.dto';
import { ReorderIssuesDto } from './dto/reorder-issues.dto';
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

  async getBoardData(projectId: string, organizationId: string) {
    await this.projectsService.findById(projectId, organizationId);

    const statuses = await this.issueStatusRepository.find({
      where: { projectId },
      order: { position: 'ASC' },
    });

    const issues = await this.issueRepository.find({
      where: { projectId, deletedAt: IsNull() },
      relations: ['assignee', 'status', 'reporter'],
      order: { position: 'ASC' },
    });

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

    const updates = dto.items.map((item) =>
      this.issueRepository.update(item.issueId, {
        statusId: item.statusId,
        position: item.position,
      }),
    );

    await Promise.all(updates);
  }
}
