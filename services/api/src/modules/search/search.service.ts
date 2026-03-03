import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Issue } from '../issues/entities/issue.entity';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Issue)
    private issueRepository: Repository<Issue>,
  ) {}

  async search(params: {
    q: string;
    organizationId: string;
    projectId?: string;
    type?: string;
    limit?: number;
  }) {
    const { q, organizationId, projectId, type, limit = 20 } = params;

    if (!q || q.trim().length === 0) {
      return { items: [], total: 0 };
    }

    const qb = this.issueRepository
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.status', 'status')
      .leftJoinAndSelect('issue.assignee', 'assignee')
      .leftJoinAndSelect('issue.project', 'project')
      .where('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL')
      .andWhere(
        '(issue.title ILIKE :q OR issue.key ILIKE :q OR issue.description ILIKE :q)',
        { q: `%${q}%` },
      );

    if (projectId) {
      qb.andWhere('issue.project_id = :projectId', { projectId });
    }

    if (type) {
      qb.andWhere('issue.type = :type', { type });
    }

    const [items, total] = await qb
      .orderBy('issue.updated_at', 'DESC')
      .take(limit)
      .getManyAndCount();

    return { items, total };
  }
}
