import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository, IsNull } from 'typeorm';
import { Queue } from 'bullmq';
import { Client } from '@elastic/elasticsearch';
import { Issue } from '../issues/entities/issue.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';

const ISSUES_INDEX = 'boardupscale-issues';

export interface SearchHighlight {
  field: string;
  snippets: string[];
}

export interface SearchResultItem {
  id: string;
  key: string;
  title: string;
  type: string;
  priority: string;
  projectId: string;
  projectName?: string;
  statusName?: string;
  assigneeName?: string;
  highlights?: SearchHighlight[];
  // Full issue data when falling back to PostgreSQL
  issue?: Issue;
}

export interface SearchResult {
  items: SearchResultItem[];
  total: number;
  source: 'elasticsearch' | 'postgresql';
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private esClient: Client | null = null;
  private esAvailable = false;

  constructor(
    @InjectRepository(Issue)
    private issueRepository: Repository<Issue>,
    @InjectRepository(ProjectMember)
    private projectMemberRepository: Repository<ProjectMember>,
    @InjectQueue('search-index')
    private searchIndexQueue: Queue,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.initElasticsearch();
  }

  private async initElasticsearch(): Promise<void> {
    const esUrl = this.configService.get<string>('elasticsearch.url');
    if (!esUrl) {
      this.logger.warn('ELASTICSEARCH_URL not configured -- using PostgreSQL fallback for search');
      return;
    }

    try {
      this.esClient = new Client({
        node: esUrl,
        requestTimeout: 5000,
        sniffOnStart: false,
      });
      const info = await this.esClient.info();
      this.esAvailable = true;
      this.logger.log(
        `Elasticsearch connected. Cluster: "${info.cluster_name}", version: ${info.version.number}`,
      );
    } catch (err: any) {
      this.esAvailable = false;
      this.esClient = null;
      this.logger.warn(
        `Elasticsearch not available: ${err.message} -- falling back to PostgreSQL for search`,
      );
    }
  }

  private readonly ADMIN_ROLES = new Set(['owner', 'admin', 'manager']);

  private async getAccessibleProjectIds(
    userId: string,
    organizationId: string,
  ): Promise<string[]> {
    const memberships = await this.projectMemberRepository.find({
      where: { userId },
      select: ['projectId'],
    });
    return memberships.map((m) => m.projectId);
  }

  async search(params: {
    q: string;
    organizationId: string;
    userId?: string;
    orgRole?: string;
    projectId?: string;
    type?: string;
    priority?: string;
    statusName?: string;
    assigneeId?: string;
    limit?: number;
  }): Promise<SearchResult> {
    const { q, organizationId, limit = 20 } = params;

    if (!q || q.trim().length === 0) {
      return { items: [], total: 0, source: 'postgresql' };
    }

    // Resolve accessible project IDs for non-admin users
    let resolvedParams = { ...params };
    const isOrgAdmin = params.orgRole && this.ADMIN_ROLES.has(params.orgRole);
    if (!isOrgAdmin && params.userId && !params.projectId) {
      const accessibleProjectIds = await this.getAccessibleProjectIds(
        params.userId,
        organizationId,
      );
      resolvedParams = { ...resolvedParams, _accessibleProjectIds: accessibleProjectIds } as any;
    }

    // Try Elasticsearch first
    if (this.esAvailable && this.esClient) {
      try {
        const esResult = await this.searchElasticsearch(resolvedParams as any);
        // If ES returned results, use them; otherwise fall back to PG
        // (handles case where ES is running but index is empty/not populated)
        if (esResult.items.length > 0) {
          return esResult;
        }
        this.logger.debug('Elasticsearch returned 0 results, trying PostgreSQL fallback');
      } catch (err: any) {
        this.logger.warn(
          `Elasticsearch search failed: ${err.message} -- falling back to PostgreSQL`,
        );
        // Mark ES as unavailable so subsequent requests go straight to PG
        this.esAvailable = false;
        // Schedule a reconnection check
        this.scheduleReconnect();
      }
    }

    // Fallback to PostgreSQL ILIKE
    return this.searchPostgresql(resolvedParams as any);
  }

  private async searchElasticsearch(params: {
    q: string;
    organizationId: string;
    projectId?: string;
    type?: string;
    priority?: string;
    statusName?: string;
    assigneeId?: string;
    limit?: number;
    _accessibleProjectIds?: string[];
  }): Promise<SearchResult> {
    const { q, organizationId, projectId, type, priority, statusName, limit = 20, _accessibleProjectIds } = params;

    // Build bool query
    const must: any[] = [
      {
        multi_match: {
          query: q,
          fields: ['title^3', 'description', 'key^2', 'assigneeName', 'labels'],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      },
    ];

    const filter: any[] = [
      { term: { organizationId } },
    ];

    if (projectId) {
      filter.push({ term: { projectId } });
    } else if (_accessibleProjectIds) {
      if (_accessibleProjectIds.length === 0) {
        return { items: [], total: 0, source: 'elasticsearch' };
      }
      filter.push({ terms: { projectId: _accessibleProjectIds } });
    }
    if (type) {
      filter.push({ term: { type } });
    }
    if (priority) {
      filter.push({ term: { priority } });
    }
    if (statusName) {
      filter.push({ term: { statusName } });
    }

    const response = await this.esClient!.search({
      index: ISSUES_INDEX,
      size: limit,
      query: {
        bool: {
          must,
          filter,
        },
      },
      highlight: {
        fields: {
          title: { number_of_fragments: 1, fragment_size: 200 },
          description: { number_of_fragments: 2, fragment_size: 150 },
          assigneeName: { number_of_fragments: 1, fragment_size: 100 },
          labels: { number_of_fragments: 1, fragment_size: 100 },
        },
        pre_tags: ['<mark>'],
        post_tags: ['</mark>'],
      },
      sort: [
        '_score',
        { updatedAt: { order: 'desc' } },
      ],
    });

    const hits = response.hits.hits;
    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? 0;

    const items: SearchResultItem[] = hits.map((hit: any) => {
      const source = hit._source;
      const highlights: SearchHighlight[] = [];

      if (hit.highlight) {
        for (const [field, snippets] of Object.entries(hit.highlight)) {
          highlights.push({
            field,
            snippets: snippets as string[],
          });
        }
      }

      return {
        id: source.id,
        key: source.key,
        title: source.title,
        type: source.type,
        priority: source.priority,
        projectId: source.projectId,
        projectName: source.projectName,
        statusName: source.statusName,
        assigneeName: source.assigneeName,
        highlights: highlights.length > 0 ? highlights : undefined,
      };
    });

    return { items, total, source: 'elasticsearch' };
  }

  private async searchPostgresql(params: {
    q: string;
    organizationId: string;
    projectId?: string;
    type?: string;
    priority?: string;
    statusName?: string;
    assigneeId?: string;
    limit?: number;
    _accessibleProjectIds?: string[];
  }): Promise<SearchResult> {
    const { q, organizationId, projectId, type, limit = 20, _accessibleProjectIds } = params;

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
    } else if (_accessibleProjectIds) {
      if (_accessibleProjectIds.length === 0) {
        return { items: [], total: 0, source: 'postgresql' };
      }
      qb.andWhere('issue.project_id IN (:...accessibleProjectIds)', {
        accessibleProjectIds: _accessibleProjectIds,
      });
    }

    if (type) {
      qb.andWhere('issue.type = :type', { type });
    }

    const [issues, total] = await qb
      .orderBy('issue.updatedAt', 'DESC')
      .take(limit)
      .getManyAndCount();

    const items: SearchResultItem[] = issues.map((issue) => ({
      id: issue.id,
      key: issue.key,
      title: issue.title,
      type: issue.type,
      priority: issue.priority,
      projectId: issue.projectId,
      projectName: issue.project?.name,
      statusName: issue.status?.name,
      assigneeName: issue.assignee?.displayName,
      issue,
    }));

    return { items, total, source: 'postgresql' };
  }

  /**
   * Find issues similar to the given text (title + optional description).
   * Used for duplicate detection during issue creation.
   * Uses Elasticsearch MLT (More Like This) query with PostgreSQL trigram fallback.
   */
  async findSimilar(params: {
    text: string;
    organizationId: string;
    projectId?: string;
    excludeIssueId?: string;
    limit?: number;
  }): Promise<SearchResult> {
    const { text } = params;

    if (!text || text.trim().length < 5) {
      return { items: [], total: 0, source: 'postgresql' };
    }

    if (this.esAvailable && this.esClient) {
      try {
        const esResult = await this.findSimilarElasticsearch(params);
        if (esResult.items.length > 0) {
          return esResult;
        }
        this.logger.debug('ES MLT returned 0 results, trying PostgreSQL trigram fallback');
      } catch (err: any) {
        this.logger.warn(
          `Elasticsearch MLT failed: ${err.message} -- falling back to PostgreSQL`,
        );
      }
    }

    return this.findSimilarPostgresql(params);
  }

  private async findSimilarElasticsearch(params: {
    text: string;
    organizationId: string;
    projectId?: string;
    excludeIssueId?: string;
    limit?: number;
  }): Promise<SearchResult> {
    const { text, organizationId, projectId, excludeIssueId, limit = 5 } = params;

    const filter: any[] = [{ term: { organizationId } }];
    if (projectId) filter.push({ term: { projectId } });

    const mustNot: any[] = [];
    if (excludeIssueId) {
      mustNot.push({ term: { id: excludeIssueId } });
    }

    const response = await this.esClient!.search({
      index: ISSUES_INDEX,
      size: limit,
      min_score: 1,
      query: {
        bool: {
          must: [
            {
              more_like_this: {
                fields: ['title', 'description'],
                like: text,
                min_term_freq: 1,
                min_doc_freq: 1,
                max_query_terms: 25,
                minimum_should_match: '30%',
              },
            },
          ],
          filter,
          must_not: mustNot,
        },
      },
      highlight: {
        fields: {
          title: { number_of_fragments: 1, fragment_size: 200 },
          description: { number_of_fragments: 1, fragment_size: 200 },
        },
        pre_tags: ['<mark>'],
        post_tags: ['</mark>'],
      },
      sort: ['_score'],
    });

    const hits = response.hits.hits;
    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? 0;

    const items: SearchResultItem[] = hits.map((hit: any) => {
      const source = hit._source;
      const highlights: SearchHighlight[] = [];
      if (hit.highlight) {
        for (const [field, snippets] of Object.entries(hit.highlight)) {
          highlights.push({ field, snippets: snippets as string[] });
        }
      }
      return {
        id: source.id,
        key: source.key,
        title: source.title,
        type: source.type,
        priority: source.priority,
        projectId: source.projectId,
        projectName: source.projectName,
        statusName: source.statusName,
        assigneeName: source.assigneeName,
        highlights: highlights.length > 0 ? highlights : undefined,
      };
    });

    return { items, total, source: 'elasticsearch' };
  }

  private async findSimilarPostgresql(params: {
    text: string;
    organizationId: string;
    projectId?: string;
    excludeIssueId?: string;
    limit?: number;
  }): Promise<SearchResult> {
    const { text, organizationId, projectId, excludeIssueId, limit = 5 } = params;

    // Use PostgreSQL trigram similarity (pg_trgm) + ILIKE fallback
    const qb = this.issueRepository
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.status', 'status')
      .leftJoinAndSelect('issue.assignee', 'assignee')
      .leftJoinAndSelect('issue.project', 'project')
      .addSelect(`similarity(issue.title, :text)`, 'title_sim')
      .where('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL')
      .andWhere(`similarity(issue.title, :text) > 0.1`, { text })
      .setParameter('text', text);

    if (projectId) {
      qb.andWhere('issue.project_id = :projectId', { projectId });
    }
    if (excludeIssueId) {
      qb.andWhere('issue.id != :excludeIssueId', { excludeIssueId });
    }

    const issues = await qb
      .orderBy('title_sim', 'DESC')
      .take(limit)
      .getMany();

    const items: SearchResultItem[] = issues.map((issue) => ({
      id: issue.id,
      key: issue.key,
      title: issue.title,
      type: issue.type,
      priority: issue.priority,
      projectId: issue.projectId,
      projectName: issue.project?.name,
      statusName: issue.status?.name,
      assigneeName: issue.assignee?.displayName,
      issue,
    }));

    return { items, total: items.length, source: 'postgresql' };
  }

  /**
   * Enqueue a reindex-project job via the BullMQ search-index queue.
   */
  async reindexProject(projectId: string, organizationId: string): Promise<void> {
    await this.searchIndexQueue.add('reindex-project', {
      projectId,
      organizationId,
    });
    this.logger.log(`Enqueued reindex-project job for project ${projectId}`);
  }

  /**
   * Schedule a reconnection attempt after ES goes down during a search.
   */
  private scheduleReconnect(): void {
    setTimeout(async () => {
      try {
        if (this.esClient) {
          await this.esClient.info();
          this.esAvailable = true;
          this.logger.log('Elasticsearch reconnected');
        }
      } catch {
        this.logger.warn('Elasticsearch still unavailable');
        // Try again in 60 seconds
        this.scheduleReconnect();
      }
    }, 30_000);
  }
}
