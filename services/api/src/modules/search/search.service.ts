import { Injectable, Logger, OnModuleInit, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '@elastic/elasticsearch';
import { Issue } from '@/modules/issues/entities/issue.entity';
import { Project } from '@/modules/projects/entities/project.entity';
import { ProjectMember } from '@/modules/projects/entities/project-member.entity';
import { ProjectKeyAlias } from '@/modules/projects/entities/project-key-alias.entity';
import { User } from '@/modules/users/entities/user.entity';
import { hasOrgWideAccess } from '@/common/constants/org-roles';
import {
  GlobalSearchResult,
  LegacyIssueSearchResult,
  SearchHighlight,
  SearchIssueItem,
  SearchMemberItem,
  SearchProjectItem,
  SearchScope,
  SearchDataSource,
} from '@/modules/search/search.types';
import {
  ISSUES_INDEX,
  PROJECTS_INDEX,
  MEMBERS_INDEX,
} from '@/modules/search/search-index.constants';
import { parseIssueKeyQuery } from '@/modules/search/search-issue-key.utils';
import { Brackets } from 'typeorm';

export type {
  SearchHighlight,
  SearchIssueItem,
  SearchProjectItem,
  SearchMemberItem,
  GlobalSearchResult,
} from './search.types';

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private esClient: Client | null = null;
  private esAvailable = false;

  constructor(
    @InjectRepository(Issue)
    private issueRepository: Repository<Issue>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(ProjectMember)
    private projectMemberRepository: Repository<ProjectMember>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(ProjectKeyAlias)
    private projectKeyAliasRepository: Repository<ProjectKeyAlias>,
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

  /**
   * Resolve search visibility for the caller.
   * Owner / Administrator: org-wide. Everyone else: explicit project_members only.
   */
  async resolveSearchScope(params: {
    organizationId: string;
    userId: string;
    orgRole?: string;
    projectId?: string;
  }): Promise<SearchScope> {
    const { organizationId, userId, orgRole, projectId } = params;
    const orgWide = hasOrgWideAccess(orgRole);

    if (orgWide) {
      if (projectId) {
        await this.assertProjectInOrg(projectId, organizationId);
      }
      return {
        orgWide: true,
        accessibleProjectIds: null,
        projectId,
      };
    }

    const accessibleProjectIds = await this.getAccessibleProjectIds(userId, organizationId);

    if (projectId) {
      if (!accessibleProjectIds.includes(projectId)) {
        throw new ForbiddenException('You do not have access to search in this project');
      }
      return {
        orgWide: false,
        accessibleProjectIds,
        projectId,
      };
    }

    return {
      orgWide: false,
      accessibleProjectIds,
    };
  }

  private async getAccessibleProjectIds(
    userId: string,
    organizationId: string,
  ): Promise<string[]> {
    const rows = await this.projectMemberRepository
      .createQueryBuilder('pm')
      .innerJoin('projects', 'p', 'p.id = pm.project_id')
      .where('pm.user_id = :userId', { userId })
      .andWhere('p.organization_id = :organizationId', { organizationId })
      .select('pm.project_id', 'projectId')
      .getRawMany<{ projectId: string }>();

    return rows.map((row) => row.projectId);
  }

  private async assertProjectInOrg(projectId: string, organizationId: string): Promise<void> {
    const exists = await this.projectRepository.exist({
      where: { id: projectId, organizationId },
    });
    if (!exists) {
      throw new ForbiddenException('You do not have access to search in this project');
    }
  }

  async search(params: {
    q: string;
    organizationId: string;
    userId: string;
    orgRole?: string;
    projectId?: string;
    type?: string;
    priority?: string;
    statusName?: string;
    limit?: number;
  }): Promise<GlobalSearchResult> {
    const { q, organizationId, userId, orgRole, type, priority, statusName } = params;
    const perCategoryLimit = Math.min(Math.max(params.limit ?? 10, 1), 25);

    if (!q || q.trim().length === 0) {
      return this.emptyGlobalResult('postgresql');
    }

    const scope = await this.resolveSearchScope({
      organizationId,
      userId,
      orgRole,
      projectId: params.projectId,
    });

    if (!scope.orgWide && scope.accessibleProjectIds?.length === 0) {
      return this.emptyGlobalResult('postgresql');
    }

    const [issues, projects, members] = await Promise.all([
      this.searchIssues({
        q: q.trim(),
        organizationId,
        scope,
        type,
        priority,
        statusName,
        limit: perCategoryLimit,
      }),
      this.searchProjects({
        q: q.trim(),
        organizationId,
        scope,
        limit: perCategoryLimit,
      }),
      this.searchMembers({
        q: q.trim(),
        organizationId,
        scope,
        limit: perCategoryLimit,
      }),
    ]);

    const source: SearchDataSource =
      issues.source === 'elasticsearch' ||
      projects.source === 'elasticsearch' ||
      members.source === 'elasticsearch'
        ? 'elasticsearch'
        : 'postgresql';

    return {
      issues: issues.items,
      projects: projects.items,
      members: members.items,
      totals: {
        issues: issues.items.length,
        projects: projects.items.length,
        members: members.items.length,
      },
      source,
    };
  }

  private emptyGlobalResult(source: 'postgresql'): GlobalSearchResult {
    return {
      issues: [],
      projects: [],
      members: [],
      totals: { issues: 0, projects: 0, members: 0 },
      source,
    };
  }

  private async searchIssues(params: {
    q: string;
    organizationId: string;
    scope: SearchScope;
    type?: string;
    priority?: string;
    statusName?: string;
    limit: number;
  }): Promise<LegacyIssueSearchResult> {
    const { q, organizationId, scope, type, priority, statusName, limit } = params;
    const projectFilter = this.resolveProjectFilter(scope);

    if (projectFilter !== undefined && projectFilter.length === 0) {
      return { items: [], total: 0, source: 'postgresql' };
    }

    const formerKeyHit = await this.trySearchIssueByFormerKey({
      q,
      organizationId,
      projectId: scope.projectId,
      projectIds: projectFilter,
      type,
      priority,
      statusName,
    });
    if (formerKeyHit) {
      return { items: [formerKeyHit], total: 1, source: 'postgresql' };
    }

    if (this.esAvailable && this.esClient) {
      try {
        return await this.searchIssuesElasticsearch({
          q,
          organizationId,
          projectId: scope.projectId,
          projectIds: projectFilter,
          type,
          priority,
          statusName,
          limit,
        });
      } catch (err: any) {
        this.logger.warn(
          `Elasticsearch search failed: ${err.message} -- falling back to PostgreSQL`,
        );
        this.esAvailable = false;
        this.scheduleReconnect();
      }
    }

    return this.searchIssuesPostgresql({
      q,
      organizationId,
      projectId: scope.projectId,
      projectIds: projectFilter,
      type,
      priority,
      statusName,
      limit,
    });
  }

  private resolveProjectFilter(scope: SearchScope): string[] | undefined {
    if (scope.projectId) {
      return [scope.projectId];
    }
    if (!scope.orgWide && scope.accessibleProjectIds) {
      return scope.accessibleProjectIds;
    }
    return undefined;
  }

  /**
   * Resolve project UUID from current key or a historical alias (single round-trip).
   */
  private async resolveProjectIdFromKeyOrAlias(
    keyPrefix: string,
    organizationId: string,
  ): Promise<string | null> {
    const normalized = keyPrefix.toUpperCase();
    const rows: Array<{ project_id: string }> = await this.projectRepository.query(
      `(SELECT id AS project_id FROM projects WHERE organization_id = $1 AND key = $2)
       UNION ALL
       (SELECT project_id FROM project_key_aliases WHERE organization_id = $1 AND old_key = $2)
       LIMIT 1`,
      [organizationId, normalized],
    );
    return rows[0]?.project_id ?? null;
  }

  private isProjectInSearchScope(
    resolvedProjectId: string,
    projectId?: string,
    projectIds?: string[],
  ): boolean {
    if (projectId) {
      return resolvedProjectId === projectId;
    }
    if (projectIds) {
      return projectIds.includes(resolvedProjectId);
    }
    return true;
  }

  /**
   * Indexed lookup by (project_id, number) when the query looks like an issue key.
   * Avoids full-text scans for former keys after a project rename (e.g. SCRUM-2 → NICE-2).
   */
  private async trySearchIssueByFormerKey(params: {
    q: string;
    organizationId: string;
    projectId?: string;
    projectIds?: string[];
    type?: string;
    priority?: string;
    statusName?: string;
  }): Promise<SearchIssueItem | null> {
    const parsedKey = parseIssueKeyQuery(params.q);
    if (!parsedKey) {
      return null;
    }

    const resolvedProjectId = await this.resolveProjectIdFromKeyOrAlias(
      parsedKey.prefix,
      params.organizationId,
    );
    if (
      !resolvedProjectId ||
      !this.isProjectInSearchScope(resolvedProjectId, params.projectId, params.projectIds)
    ) {
      return null;
    }

    const qb = this.issueRepository
      .createQueryBuilder('issue')
      .select([
        'issue.id',
        'issue.key',
        'issue.title',
        'issue.type',
        'issue.priority',
        'issue.projectId',
        'issue.updatedAt',
      ])
      .leftJoin('issue.status', 'status')
      .addSelect(['status.name'])
      .leftJoin('issue.assignee', 'assignee')
      .addSelect(['assignee.displayName'])
      .leftJoin('issue.project', 'project')
      .addSelect(['project.key', 'project.name'])
      .where('issue.organization_id = :organizationId', { organizationId: params.organizationId })
      .andWhere('issue.deleted_at IS NULL')
      .andWhere('issue.project_id = :projectId', { projectId: resolvedProjectId })
      .andWhere('issue.number = :issueNumber', { issueNumber: parsedKey.number });

    if (params.type) qb.andWhere('issue.type = :type', { type: params.type });
    if (params.priority) qb.andWhere('issue.priority = :priority', { priority: params.priority });
    if (params.statusName) qb.andWhere('status.name = :statusName', { statusName: params.statusName });

    const issue = await qb.getOne();
    if (!issue) {
      return null;
    }

    const matchedFormerKey =
      parsedKey.formerKey.toUpperCase() !== issue.key.toUpperCase()
        ? parsedKey.formerKey
        : undefined;

    return {
      kind: 'issue',
      id: issue.id,
      key: issue.key,
      title: issue.title,
      type: issue.type,
      priority: issue.priority,
      projectId: issue.projectId,
      projectKey: issue.project?.key,
      projectName: issue.project?.name,
      statusName: issue.status?.name,
      assigneeName: issue.assignee?.displayName,
      matchedFormerKey,
    };
  }

  private async loadMatchedFormerProjectKeys(
    organizationId: string,
    q: string,
    projectIds: string[],
  ): Promise<Map<string, string>> {
    if (projectIds.length === 0) {
      return new Map();
    }

    const aliases = await this.projectKeyAliasRepository
      .createQueryBuilder('alias')
      .select(['alias.projectId', 'alias.oldKey'])
      .where('alias.organization_id = :organizationId', { organizationId })
      .andWhere('alias.project_id IN (:...projectIds)', { projectIds })
      .andWhere('alias.old_key ILIKE :q', { q: `%${q}%` })
      .getMany();

    const map = new Map<string, string>();
    const qUpper = q.trim().toUpperCase();
    for (const alias of aliases) {
      if (alias.oldKey.toUpperCase().includes(qUpper)) {
        map.set(alias.projectId, alias.oldKey);
      }
    }
    return map;
  }

  private buildEsProjectScopeFilters(params: {
    organizationId: string;
    projectId?: string;
    projectIds?: string[];
  }): { filter: object[]; empty: boolean } {
    const { organizationId, projectId, projectIds } = params;
    const filter: object[] = [
      { term: { organizationId } },
      { term: { status: 'active' } },
    ];

    if (projectId) {
      filter.push({ term: { id: projectId } });
    } else if (projectIds) {
      if (projectIds.length === 0) {
        return { filter, empty: true };
      }
      filter.push({ terms: { id: projectIds } });
    }

    return { filter, empty: false };
  }

  private buildEsMemberScopeFilters(params: {
    organizationId: string;
    projectId?: string;
    projectIds?: string[];
  }): { filter: object[]; empty: boolean } {
    const { organizationId, projectId, projectIds } = params;
    const filter: object[] = [{ term: { organizationId } }];

    if (projectId) {
      filter.push({ term: { projectIds: projectId } });
    } else if (projectIds) {
      if (projectIds.length === 0) {
        return { filter, empty: true };
      }
      filter.push({ terms: { projectIds: projectIds } });
    }

    return { filter, empty: false };
  }

  private mapEsHighlights(hit: { highlight?: Record<string, string[]> }): SearchHighlight[] | undefined {
    if (!hit.highlight) return undefined;
    const highlights: SearchHighlight[] = [];
    for (const [field, snippets] of Object.entries(hit.highlight)) {
      highlights.push({ field, snippets });
    }
    return highlights.length > 0 ? highlights : undefined;
  }

  private async searchIssuesElasticsearch(params: {
    q: string;
    organizationId: string;
    projectId?: string;
    projectIds?: string[];
    type?: string;
    priority?: string;
    statusName?: string;
    limit: number;
  }): Promise<LegacyIssueSearchResult> {
    const { q, organizationId, projectId, projectIds, type, priority, statusName, limit } = params;

    const parsedKey = parseIssueKeyQuery(q);
    if (parsedKey) {
      const resolvedProjectId = await this.resolveProjectIdFromKeyOrAlias(
        parsedKey.prefix,
        organizationId,
      );
      if (
        resolvedProjectId &&
        this.isProjectInSearchScope(resolvedProjectId, projectId, projectIds)
      ) {
        const filter: object[] = [
          { term: { organizationId } },
          { term: { projectId: resolvedProjectId } },
          { term: { number: parsedKey.number } },
        ];
        if (type) filter.push({ term: { type } });
        if (priority) filter.push({ term: { priority } });
        if (statusName) filter.push({ term: { statusName } });

        const pointResponse = await this.esClient!.search({
          index: ISSUES_INDEX,
          size: 1,
          query: { bool: { filter } },
        });

        const pointHit = pointResponse.hits.hits[0] as { _source?: Record<string, unknown> } | undefined;
        if (pointHit?._source) {
          const source = pointHit._source;
          const currentKey = String(source.key ?? '');
          return {
            items: [
              {
                kind: 'issue',
                id: String(source.id),
                key: currentKey,
                title: String(source.title ?? ''),
                type: String(source.type ?? ''),
                priority: String(source.priority ?? ''),
                projectId: String(source.projectId ?? ''),
                projectName: source.projectName ? String(source.projectName) : undefined,
                statusName: source.statusName ? String(source.statusName) : undefined,
                assigneeName: source.assigneeName ? String(source.assigneeName) : undefined,
                matchedFormerKey:
                  parsedKey.formerKey.toUpperCase() !== currentKey.toUpperCase()
                    ? parsedKey.formerKey
                    : undefined,
              },
            ],
            total: 1,
            source: 'elasticsearch',
          };
        }
      }
    }

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

    const filter: any[] = [{ term: { organizationId } }];

    if (projectId) {
      filter.push({ term: { projectId } });
    } else if (projectIds) {
      if (projectIds.length === 0) {
        return { items: [], total: 0, source: 'elasticsearch' };
      }
      filter.push({ terms: { projectId: projectIds } });
    }
    if (type) filter.push({ term: { type } });
    if (priority) filter.push({ term: { priority } });
    if (statusName) filter.push({ term: { statusName } });

    const response = await this.esClient!.search({
      index: ISSUES_INDEX,
      size: limit,
      query: { bool: { must, filter } },
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
      sort: ['_score', { updatedAt: { order: 'desc' } }],
    });

    const hits = response.hits.hits;
    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? 0;

    const items: SearchIssueItem[] = hits.map((hit: any) => {
      const source = hit._source;
      const highlights: SearchHighlight[] = [];
      if (hit.highlight) {
        for (const [field, snippets] of Object.entries(hit.highlight)) {
          highlights.push({ field, snippets: snippets as string[] });
        }
      }
      return {
        kind: 'issue',
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

    return { items, total: items.length, source: 'elasticsearch' };
  }

  private async searchIssuesPostgresql(params: {
    q: string;
    organizationId: string;
    projectId?: string;
    projectIds?: string[];
    type?: string;
    priority?: string;
    statusName?: string;
    limit: number;
  }): Promise<LegacyIssueSearchResult> {
    const { q, organizationId, projectId, projectIds, type, priority, statusName, limit } = params;

    const qb = this.issueRepository
      .createQueryBuilder('issue')
      .select([
        'issue.id',
        'issue.key',
        'issue.title',
        'issue.type',
        'issue.priority',
        'issue.projectId',
        'issue.updatedAt',
      ])
      .leftJoin('issue.status', 'status')
      .addSelect(['status.name'])
      .leftJoin('issue.assignee', 'assignee')
      .addSelect(['assignee.displayName'])
      .leftJoin('issue.project', 'project')
      .addSelect(['project.key', 'project.name'])
      .where('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL');

    const parsedKey = parseIssueKeyQuery(q);
    const likeQ = `%${q}%`;
    if (parsedKey) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('(issue.title ILIKE :q OR issue.key ILIKE :q OR issue.description ILIKE :q)', {
              q: likeQ,
            })
            .orWhere('(issue.key = :exactKey)', { exactKey: parsedKey.formerKey });
        }),
      );
    } else {
      qb.andWhere('(issue.title ILIKE :q OR issue.key ILIKE :q OR issue.description ILIKE :q)', {
        q: likeQ,
      });
    }

    if (projectId) {
      qb.andWhere('issue.project_id = :projectId', { projectId });
    } else if (projectIds) {
      if (projectIds.length === 0) {
        return { items: [], total: 0, source: 'postgresql' };
      }
      qb.andWhere('issue.project_id IN (:...projectIds)', { projectIds });
    }

    if (type) qb.andWhere('issue.type = :type', { type });
    if (priority) qb.andWhere('issue.priority = :priority', { priority });
    if (statusName) qb.andWhere('status.name = :statusName', { statusName });

    const issues = await qb.orderBy('issue.updatedAt', 'DESC').take(limit).getMany();

    const items: SearchIssueItem[] = issues.map((issue) => {
      const matchedFormerKey =
        parsedKey && parsedKey.formerKey.toUpperCase() !== issue.key.toUpperCase()
          ? parsedKey.formerKey
          : undefined;

      return {
        kind: 'issue',
        id: issue.id,
        key: issue.key,
        title: issue.title,
        type: issue.type,
        priority: issue.priority,
        projectId: issue.projectId,
        projectKey: issue.project?.key,
        projectName: issue.project?.name,
        statusName: issue.status?.name,
        assigneeName: issue.assignee?.displayName,
        matchedFormerKey,
      };
    });

    return { items, total: items.length, source: 'postgresql' };
  }

  private async searchProjects(params: {
    q: string;
    organizationId: string;
    scope: SearchScope;
    limit: number;
  }): Promise<{ items: SearchProjectItem[]; total: number; source: SearchDataSource }> {
    const { q, organizationId, scope, limit } = params;
    const projectFilter = this.resolveProjectFilter(scope);

    if (projectFilter !== undefined && projectFilter.length === 0) {
      return { items: [], total: 0, source: 'postgresql' };
    }

    if (this.esAvailable && this.esClient) {
      try {
        return await this.searchProjectsElasticsearch({
          q,
          organizationId,
          projectId: scope.projectId,
          projectIds: projectFilter,
          limit,
        });
      } catch (err: any) {
        this.logger.warn(
          `Elasticsearch project search failed: ${err.message} -- falling back to PostgreSQL`,
        );
        this.esAvailable = false;
        this.scheduleReconnect();
      }
    }

    return this.searchProjectsPostgresql({
      q,
      organizationId,
      scope,
      projectFilter,
      limit,
    });
  }

  private async searchProjectsElasticsearch(params: {
    q: string;
    organizationId: string;
    projectId?: string;
    projectIds?: string[];
    limit: number;
  }): Promise<{ items: SearchProjectItem[]; total: number; source: SearchDataSource }> {
    const { q, organizationId, projectId, projectIds, limit } = params;
    const { filter, empty } = this.buildEsProjectScopeFilters({
      organizationId,
      projectId,
      projectIds,
    });
    if (empty) {
      return { items: [], total: 0, source: 'elasticsearch' };
    }

    const response = await this.esClient!.search({
      index: PROJECTS_INDEX,
      size: limit,
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query: q,
                fields: ['name^3', 'key^2', 'legacyKeys^2'],
                type: 'best_fields',
                fuzziness: 'AUTO',
              },
            },
          ],
          filter,
        },
      },
      highlight: {
        fields: {
          name: { number_of_fragments: 1, fragment_size: 120 },
          key: { number_of_fragments: 1, fragment_size: 40 },
        },
        pre_tags: ['<mark>'],
        post_tags: ['</mark>'],
      },
      sort: ['_score', { updatedAt: { order: 'desc' } }],
    });

    const qUpper = q.trim().toUpperCase();
    const items: SearchProjectItem[] = response.hits.hits.map((hit: any) => {
      const source = hit._source;
      const legacyKeys: string[] = Array.isArray(source.legacyKeys) ? source.legacyKeys : [];
      const matchedFormerKey = legacyKeys.find(
        (legacyKey) =>
          legacyKey.toUpperCase().includes(qUpper) &&
          legacyKey.toUpperCase() !== String(source.key ?? '').toUpperCase(),
      );
      return {
        kind: 'project' as const,
        id: source.id,
        key: source.key,
        name: source.name,
        type: source.type,
        color: source.color ?? undefined,
        iconUrl: source.iconUrl ?? undefined,
        highlights: this.mapEsHighlights(hit),
        matchedFormerKey,
      };
    });

    return { items, total: items.length, source: 'elasticsearch' };
  }

  private async searchProjectsPostgresql(params: {
    q: string;
    organizationId: string;
    scope: SearchScope;
    projectFilter?: string[];
    limit: number;
  }): Promise<{ items: SearchProjectItem[]; total: number; source: SearchDataSource }> {
    const { q, organizationId, scope, projectFilter, limit } = params;

    const qb = this.projectRepository
      .createQueryBuilder('project')
      .select([
        'project.id',
        'project.key',
        'project.name',
        'project.type',
        'project.color',
        'project.iconUrl',
        'project.updatedAt',
      ])
      .where('project.organization_id = :organizationId', { organizationId })
      .andWhere('project.status != :archived', { archived: 'archived' })
      .andWhere(
        `(project.name ILIKE :q OR project.key ILIKE :q OR EXISTS (
          SELECT 1 FROM project_key_aliases alias
          WHERE alias.project_id = project.id
            AND alias.organization_id = :organizationId
            AND alias.old_key ILIKE :q
        ))`,
        { q: `%${q}%`, organizationId },
      );

    if (scope.projectId) {
      qb.andWhere('project.id = :projectId', { projectId: scope.projectId });
    } else if (projectFilter) {
      qb.andWhere('project.id IN (:...projectIds)', { projectIds: projectFilter });
    }

    const projects = await qb.orderBy('project.updatedAt', 'DESC').take(limit).getMany();
    const formerKeyByProject = await this.loadMatchedFormerProjectKeys(
      organizationId,
      q,
      projects.map((project) => project.id),
    );

    return {
      items: projects.map((project) => ({
        kind: 'project' as const,
        id: project.id,
        key: project.key,
        name: project.name,
        type: project.type,
        color: project.color ?? undefined,
        iconUrl: project.iconUrl ?? undefined,
        matchedFormerKey: formerKeyByProject.get(project.id),
      })),
      total: projects.length,
      source: 'postgresql',
    };
  }

  private async searchMembers(params: {
    q: string;
    organizationId: string;
    scope: SearchScope;
    limit: number;
  }): Promise<{ items: SearchMemberItem[]; total: number; source: SearchDataSource }> {
    const { q, organizationId, scope, limit } = params;
    const projectFilter = this.resolveProjectFilter(scope);

    if (!scope.orgWide && projectFilter !== undefined && projectFilter.length === 0) {
      return { items: [], total: 0, source: 'postgresql' };
    }

    if (this.esAvailable && this.esClient) {
      try {
        return await this.searchMembersElasticsearch({
          q,
          organizationId,
          projectId: scope.projectId,
          projectIds: projectFilter,
          limit,
        });
      } catch (err: any) {
        this.logger.warn(
          `Elasticsearch member search failed: ${err.message} -- falling back to PostgreSQL`,
        );
        this.esAvailable = false;
        this.scheduleReconnect();
      }
    }

    return this.searchMembersPostgresql({
      q,
      organizationId,
      scope,
      projectFilter,
      limit,
    });
  }

  private async searchMembersElasticsearch(params: {
    q: string;
    organizationId: string;
    projectId?: string;
    projectIds?: string[];
    limit: number;
  }): Promise<{ items: SearchMemberItem[]; total: number; source: SearchDataSource }> {
    const { q, organizationId, projectId, projectIds, limit } = params;
    const { filter, empty } = this.buildEsMemberScopeFilters({
      organizationId,
      projectId,
      projectIds,
    });
    if (empty) {
      return { items: [], total: 0, source: 'elasticsearch' };
    }

    const response = await this.esClient!.search({
      index: MEMBERS_INDEX,
      size: limit,
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query: q,
                fields: ['displayName^3', 'email^2'],
                type: 'best_fields',
                fuzziness: 'AUTO',
              },
            },
          ],
          filter,
        },
      },
      highlight: {
        fields: {
          displayName: { number_of_fragments: 1, fragment_size: 120 },
          email: { number_of_fragments: 1, fragment_size: 120 },
        },
        pre_tags: ['<mark>'],
        post_tags: ['</mark>'],
      },
      sort: ['_score', { 'displayName.keyword': { order: 'asc' } }],
    });

    const items: SearchMemberItem[] = response.hits.hits.map((hit: any) => {
      const source = hit._source;
      return {
        kind: 'member' as const,
        id: source.userId,
        displayName: source.displayName,
        email: source.email,
        avatarUrl: source.avatarUrl ?? undefined,
        contextProjectKey: source.sampleProjectKey ?? undefined,
        highlights: this.mapEsHighlights(hit),
      };
    });

    return { items, total: items.length, source: 'elasticsearch' };
  }

  private async searchMembersPostgresql(params: {
    q: string;
    organizationId: string;
    scope: SearchScope;
    projectFilter?: string[];
    limit: number;
  }): Promise<{ items: SearchMemberItem[]; total: number; source: SearchDataSource }> {
    const { q, organizationId, scope, projectFilter, limit } = params;

    const qb = this.userRepository
      .createQueryBuilder('user')
      .select('user.id', 'id')
      .addSelect('user.display_name', 'displayName')
      .addSelect('user.email', 'email')
      .addSelect('user.avatar_url', 'avatarUrl')
      .where('user.is_active = true')
      .andWhere('(user.display_name ILIKE :q OR user.email ILIKE :q)', { q: `%${q}%` });

    if (scope.orgWide) {
      qb.innerJoin(
        'organization_members',
        'om',
        'om.user_id = user.id AND om.organization_id = :organizationId',
        { organizationId },
      );
      if (scope.projectId) {
        qb.innerJoin(
          'project_members',
          'pm',
          'pm.user_id = user.id AND pm.project_id = :projectId',
          { projectId: scope.projectId },
        )
          .innerJoin('projects', 'p', 'p.id = pm.project_id')
          .addSelect('MIN(p.key)', 'contextProjectKey');
      }
    } else {
      qb.innerJoin('project_members', 'pm', 'pm.user_id = user.id').innerJoin(
        'projects',
        'p',
        'p.id = pm.project_id AND p.organization_id = :organizationId',
        { organizationId },
      );

      if (scope.projectId) {
        qb.andWhere('pm.project_id = :projectId', { projectId: scope.projectId });
      } else if (projectFilter) {
        qb.andWhere('pm.project_id IN (:...projectIds)', { projectIds: projectFilter });
      }

      qb.addSelect('MIN(p.key)', 'contextProjectKey');
    }

    qb.groupBy('user.id')
      .addGroupBy('user.display_name')
      .addGroupBy('user.email')
      .addGroupBy('user.avatar_url')
      .orderBy('user.display_name', 'ASC');

    const rows = await qb.limit(limit).getRawMany<{
      id: string;
      displayName: string;
      email: string;
      avatarUrl: string | null;
      contextProjectKey: string | null;
    }>();

    const items = rows.map((row) => ({
      kind: 'member' as const,
      id: row.id,
      displayName: row.displayName,
      email: row.email,
      avatarUrl: row.avatarUrl ?? undefined,
      contextProjectKey: row.contextProjectKey ?? undefined,
    }));

    return { items, total: items.length, source: 'postgresql' };
  }

  async findSimilar(params: {
    text: string;
    organizationId: string;
    userId: string;
    orgRole?: string;
    projectId?: string;
    excludeIssueId?: string;
    limit?: number;
  }): Promise<LegacyIssueSearchResult> {
    const { text, organizationId, userId, orgRole, projectId, excludeIssueId } = params;
    const limit = params.limit ?? 5;

    if (!text || text.trim().length < 5) {
      return { items: [], total: 0, source: 'postgresql' };
    }

    const scope = await this.resolveSearchScope({
      organizationId,
      userId,
      orgRole,
      projectId,
    });

    if (!scope.orgWide && scope.accessibleProjectIds?.length === 0) {
      return { items: [], total: 0, source: 'postgresql' };
    }

    const projectFilter = this.resolveProjectFilter(scope);
    if (projectFilter !== undefined && projectFilter.length === 0) {
      return { items: [], total: 0, source: 'postgresql' };
    }

    if (this.esAvailable && this.esClient) {
      try {
        return await this.findSimilarElasticsearch({
          text,
          organizationId,
          projectId: scope.projectId,
          projectIds: projectFilter,
          excludeIssueId,
          limit,
        });
      } catch (err: any) {
        this.logger.warn(
          `Elasticsearch MLT failed: ${err.message} -- falling back to PostgreSQL`,
        );
      }
    }

    return this.findSimilarPostgresql({
      text,
      organizationId,
      projectId: scope.projectId,
      projectIds: projectFilter,
      excludeIssueId,
      limit,
    });
  }

  private async findSimilarElasticsearch(params: {
    text: string;
    organizationId: string;
    projectId?: string;
    projectIds?: string[];
    excludeIssueId?: string;
    limit: number;
  }): Promise<LegacyIssueSearchResult> {
    const { text, organizationId, projectId, projectIds, excludeIssueId, limit } = params;

    const filter: any[] = [{ term: { organizationId } }];
    if (projectId) {
      filter.push({ term: { projectId } });
    } else if (projectIds) {
      if (projectIds.length === 0) {
        return { items: [], total: 0, source: 'elasticsearch' };
      }
      filter.push({ terms: { projectId: projectIds } });
    }

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

    const items: SearchIssueItem[] = hits.map((hit: any) => {
      const source = hit._source;
      const highlights: SearchHighlight[] = [];
      if (hit.highlight) {
        for (const [field, snippets] of Object.entries(hit.highlight)) {
          highlights.push({ field, snippets: snippets as string[] });
        }
      }
      return {
        kind: 'issue',
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

    return { items, total: items.length, source: 'elasticsearch' };
  }

  private async findSimilarPostgresql(params: {
    text: string;
    organizationId: string;
    projectId?: string;
    projectIds?: string[];
    excludeIssueId?: string;
    limit: number;
  }): Promise<LegacyIssueSearchResult> {
    const { text, organizationId, projectId, projectIds, excludeIssueId, limit } = params;

    const qb = this.issueRepository
      .createQueryBuilder('issue')
      .select([
        'issue.id',
        'issue.key',
        'issue.title',
        'issue.type',
        'issue.priority',
        'issue.projectId',
      ])
      .leftJoin('issue.status', 'status')
      .addSelect(['status.name'])
      .leftJoin('issue.assignee', 'assignee')
      .addSelect(['assignee.displayName'])
      .leftJoin('issue.project', 'project')
      .addSelect(['project.key', 'project.name'])
      .addSelect(`similarity(issue.title, :text)`, 'title_sim')
      .where('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL')
      .andWhere(`similarity(issue.title, :text) > 0.1`, { text })
      .setParameter('text', text);

    if (projectId) {
      qb.andWhere('issue.project_id = :projectId', { projectId });
    } else if (projectIds) {
      if (projectIds.length === 0) {
        return { items: [], total: 0, source: 'postgresql' };
      }
      qb.andWhere('issue.project_id IN (:...projectIds)', { projectIds });
    }

    if (excludeIssueId) {
      qb.andWhere('issue.id != :excludeIssueId', { excludeIssueId });
    }

    const issues = await qb.orderBy('title_sim', 'DESC').take(limit).getMany();

    const items: SearchIssueItem[] = issues.map((issue) => ({
      kind: 'issue',
      id: issue.id,
      key: issue.key,
      title: issue.title,
      type: issue.type,
      priority: issue.priority,
      projectId: issue.projectId,
      projectKey: issue.project?.key,
      projectName: issue.project?.name,
      statusName: issue.status?.name,
      assigneeName: issue.assignee?.displayName,
    }));

    return { items, total: items.length, source: 'postgresql' };
  }

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
        this.scheduleReconnect();
      }
    }, 30_000);
  }
}
