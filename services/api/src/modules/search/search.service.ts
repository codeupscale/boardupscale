import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository, IsNull } from 'typeorm';
import { Queue } from 'bullmq';
import { Client } from '@elastic/elasticsearch';
import { Issue } from '../issues/entities/issue.entity';

const ISSUES_INDEX = 'projectflow-issues';

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

  async search(params: {
    q: string;
    organizationId: string;
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

    // Try Elasticsearch first
    if (this.esAvailable && this.esClient) {
      try {
        return await this.searchElasticsearch(params);
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
    return this.searchPostgresql(params);
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
  }): Promise<SearchResult> {
    const { q, organizationId, projectId, type, priority, statusName, limit = 20 } = params;

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
  }): Promise<SearchResult> {
    const { q, organizationId, projectId, type, limit = 20 } = params;

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

    const [issues, total] = await qb
      .orderBy('issue.updated_at', 'DESC')
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
