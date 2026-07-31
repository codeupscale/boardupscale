import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import {
  DASHBOARD_ACTIVITY_ACTIONS,
  DASHBOARD_ACTIVITY_FEED_LIMIT,
  DASHBOARD_CACHE_TTL_SECONDS,
  DASHBOARD_PROJECT_HEALTH_CACHE_TTL_SECONDS,
  DASHBOARD_RANGE_DAYS,
  DashboardRange,
  PROJECT_HEALTH_CHART_KEYS,
  ProjectHealthStatus,
} from './project-health.constants';
import { DashboardScopeResolver } from './dashboard-scope.resolver';
import {
  ActivityFeedItem,
  DonutSection,
  HealthSegment,
  OrgDashboardResponse,
  OrgProjectHealthPage,
  ProjectHealthRow,
} from './dto/org-dashboard-response';
import {
  ActiveSprintSummary,
  IssueStatusBucket,
  IssueStatusDonut,
  MemberActivityFeedPage,
  MemberDashboardResponse,
  MemberScopedProject,
  TeamWorkload,
  WorkloadMember,
} from './dto/member-dashboard-response';
import {
  PROJECT_HEALTH_PAGE_DEFAULT,
  PROJECT_HEALTH_PAGE_MAX,
} from './dto/org-project-health-query.dto';
import {
  MEMBER_ACTIVITY_PAGE_DEFAULT,
  MEMBER_ACTIVITY_PAGE_MAX,
} from './dto/member-activity-query.dto';
import { buildMemberSnapshot } from './member-snapshot.builder';
import {
  PROJECT_HEALTH_PROGRESS_SQL,
  PROJECT_HEALTH_ROLLUP_CTE,
  PROJECT_HEALTH_SORT_RANK_SQL,
  PROJECT_HEALTH_STATUS_SQL,
  decodeProjectHealthCursor,
  encodeProjectHealthCursor,
  isProjectHealthStatus,
} from './project-health.sql';
import {
  ActivityFeedCursorPayload,
  decodeActivityFeedCursor,
  encodeActivityFeedCursor,
} from './activity-feed.sql';
import {
  MEMBER_PROJECT_HEALTH_ROLLUP_CTE,
  MEMBER_SCOPED_PROJECTS_CTE,
  buildMemberScopedProjectsCte,
} from './member-scope.sql';
import {
  MEMBER_ACTIVE_SPRINTS_LIMIT,
  TEAM_WORKLOAD_TOP_BUSIEST_LIMIT,
  classifyWorkloadCapacity,
} from './team-workload.constants';

interface StatusCountRow {
  health_status: string;
  cnt: string | number;
}

interface KpiRow {
  total_projects: string | number;
  total_members: string | number;
  pending_invites: string | number;
  billing_status: string | null;
  billing_plan_name: string | null;
  members_added_this_month: string | number;
  pending_created_this_month: string | number;
  invites_accepted_this_month: string | number;
  active_invitations: string | number;
  next_invite_expiry_at: Date | string | null;
  role_counts: Record<string, number> | string | null;
}

interface ActivityDayRow {
  day: string;
  count: string | number;
}

interface ActivityFeedRow {
  id: string;
  user_id: string | null;
  user_display_name: string | null;
  user_avatar_url: string | null;
  action: string;
  issue_key: string | null;
  issue_title: string | null;
  project_key: string | null;
  created_at: Date | string;
}

interface ProjectHealthSqlRow {
  project_id: string;
  name: string;
  key: string;
  type: string;
  open_tickets: string | number;
  blocked_open_tickets: string | number;
  overdue_tickets: string | number;
  completed_tickets: string | number;
  active_sprint_name: string | null;
  health_status: string;
  progress_percent: string | number;
  sort_order: string | number;
  total_count?: string | number;
}

interface MemberKpiRow {
  total_projects: string | number;
  total_members: string | number;
  open_issues: string | number;
  overdue_issues: string | number;
  todo_count: string | number;
  in_progress_count: string | number;
  blocked_count: string | number;
  done_count: string | number;
}

interface MemberActiveProjectsRow {
  active_count: string | number;
}

interface MemberActiveSprintRow {
  sprint_id: string;
  name: string;
  project_id: string;
  project_name: string;
  start_date: string | null;
  end_date: string | null;
  total_issues: string | number;
  done_issues: string | number;
}

interface MemberScopedProjectRow {
  id: string;
  name: string;
  key: string;
}

/**
 * Independent per-widget project filters for the member dashboard's
 * fixed-budget aggregate payload. "Recent Project Activity" is not included
 * here — it's paged separately via getMemberActivityFeed, which takes its
 * own projectId param.
 */
export interface MemberDashboardProjectFilters {
  issueStatusProjectId?: string;
  activeSprintProjectId?: string;
  teamWorkloadProjectId?: string;
}

interface MemberWorkloadRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  active_count: string | number;
  in_progress_count: string | number;
  done_count: string | number;
  overdue_count: string | number;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  private redis: Redis | null = null;

  /** Test hook: counts DB round-trips per uncached build (must stay ≤ 4). */
  lastQueryCount = 0;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly scopeResolver: DashboardScopeResolver,
    private readonly configService: ConfigService,
  ) {
    this.initRedis();
  }

  private initRedis(): void {
    try {
      const redisUrl = this.configService.get<string>('redis.url');
      if (!redisUrl) {
        return;
      }
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      this.redis.connect().catch((err: Error) => {
        this.logger.warn(
          `Dashboard Redis connect failed: ${err.message} — caching disabled`,
        );
        this.redis = null;
      });
    } catch (err) {
      this.logger.warn(
        `Dashboard Redis init failed: ${(err as Error).message}`,
      );
      this.redis = null;
    }
  }

  private cacheKey(organizationId: string, range: DashboardRange): string {
    return `dash:org:${organizationId}:owner:${range}:v5`;
  }

  private projectHealthCacheKey(
    organizationId: string,
    status: string,
    cursor: string,
    limit: number,
  ): string {
    return `dash:org:${organizationId}:project-health:v1:${status}:${cursor || '_'}:${limit}`;
  }

  private memberCacheKey(
    organizationId: string,
    userId: string,
    range: DashboardRange,
    filters?: MemberDashboardProjectFilters,
  ): string {
    const filterKey = [
      filters?.issueStatusProjectId,
      filters?.activeSprintProjectId,
      filters?.teamWorkloadProjectId,
    ]
      .map((id) => id ?? 'all')
      .join(':');
    return `dash:member:${organizationId}:${userId}:v3:${range}:${filterKey}`;
  }

  private memberProjectHealthCacheKey(
    organizationId: string,
    userId: string,
    status: string,
    cursor: string,
    limit: number,
  ): string {
    return `dash:member:${organizationId}:${userId}:project-health:v1:${status}:${cursor || '_'}:${limit}`;
  }

  async getOrgOwnerDashboard(
    organizationId: string,
    range: DashboardRange = '7d',
  ): Promise<OrgDashboardResponse> {
    this.scopeResolver.resolveProjectScope('org_owner');

    const key = this.cacheKey(organizationId, range);
    const cached = await this.readCache(key);
    if (cached) {
      return {
        ...cached,
        meta: { ...cached.meta, cacheHit: true },
      };
    }

    const lockKey = `${key}:lock`;
    const acquired = await this.tryAcquireLock(lockKey);
    if (!acquired) {
      await sleep(120);
      const afterWait = await this.readCache(key);
      if (afterWait) {
        return {
          ...afterWait,
          meta: { ...afterWait.meta, cacheHit: true },
        };
      }
    }

    try {
      const built = await this.buildOrgOwnerDashboard(organizationId, range);
      await this.writeCache(key, built);
      return built;
    } finally {
      if (acquired) {
        await this.releaseLock(lockKey);
      }
    }
  }

  private async tryAcquireLock(lockKey: string): Promise<boolean> {
    if (!this.redis) return true;
    try {
      const result = await this.redis.set(lockKey, '1', 'EX', 5, 'NX');
      return result === 'OK';
    } catch {
      return true; // fail open
    }
  }

  private async releaseLock(lockKey: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(lockKey);
    } catch {
      // ignore
    }
  }

  /**
   * Fixed-budget aggregation: exactly 4 parallel DB round-trips.
   * Project health rows are paged via getOrgProjectHealth (separate endpoint).
   */
  async buildOrgOwnerDashboard(
    organizationId: string,
    range: DashboardRange,
  ): Promise<OrgDashboardResponse> {
    this.lastQueryCount = 0;
    const days = DASHBOARD_RANGE_DAYS[range] ?? 7;
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    from.setUTCDate(from.getUTCDate() - (days - 1));

    const [kpiRows, statusCountRows, seriesRows, feedRows] = await Promise.all([
      this.queryKpis(organizationId),
      this.queryProjectStatusCounts(organizationId),
      this.queryActivitySeries(organizationId, from),
      this.queryActivityFeed(organizationId),
    ]);

    this.lastQueryCount = 4;

    const kpi = kpiRows[0] ?? {
      total_projects: 0,
      total_members: 0,
      pending_invites: 0,
      billing_status: null,
      billing_plan_name: null,
      members_added_this_month: 0,
      pending_created_this_month: 0,
      invites_accepted_this_month: 0,
      active_invitations: 0,
      next_invite_expiry_at: null,
      role_counts: {},
    };

    const projectsByStatus = this.buildDonutFromCounts(statusCountRows);
    // Single source of truth with Projects by Status donut (health classification).
    const activeProjects =
      projectsByStatus.segments.find((s) => s.key === 'active')?.count ?? 0;

    const pendingCreated = toInt(kpi.pending_created_this_month);
    const invitesAccepted = toInt(kpi.invites_accepted_this_month);
    const memberSnapshot = buildMemberSnapshot({
      totalMembers: toInt(kpi.total_members),
      membersAddedThisMonth: toInt(kpi.members_added_this_month),
      pendingInvites: toInt(kpi.pending_invites),
      pendingInvitesTrendDelta: pendingCreated - invitesAccepted,
      activeInvitations: toInt(kpi.active_invitations),
      nextInviteExpiryAt: kpi.next_invite_expiry_at,
      roleCounts: parseRoleCounts(kpi.role_counts),
    });

    const series = this.fillSeries(from, days, seriesRows);
    const recent = feedRows.map((row) => this.toFeedItem(row));

    return {
      kpis: {
        totalProjects: toInt(kpi.total_projects),
        activeProjects,
        totalMembers: toInt(kpi.total_members),
        pendingInvites: toInt(kpi.pending_invites),
        billingStatus: kpi.billing_status,
        billingPlanName: kpi.billing_plan_name,
        securityAlerts: { count: 0, comingSoon: true },
      },
      memberSnapshot,
      projectsByStatus,
      activity: { series, recent },
      meta: {
        range,
        generatedAt: new Date().toISOString(),
        variant: 'org_owner',
        cacheHit: false,
      },
    };
  }

  /**
   * Keyset-paged project health rows for infinite scroll (1000+ safe).
   */
  async getOrgProjectHealth(
    organizationId: string,
    options: {
      status?: ProjectHealthStatus | 'all';
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<OrgProjectHealthPage> {
    this.scopeResolver.resolveProjectScope('org_owner');

    const status = options.status ?? 'all';
    if (status !== 'all' && !isProjectHealthStatus(status)) {
      throw new BadRequestException('Invalid status filter');
    }

    const limit = Math.min(
      PROJECT_HEALTH_PAGE_MAX,
      Math.max(1, options.limit ?? PROJECT_HEALTH_PAGE_DEFAULT),
    );
    const cursorRaw = options.cursor?.trim() || '';
    const decoded = decodeProjectHealthCursor(cursorRaw || null);
    if (cursorRaw && !decoded) {
      throw new BadRequestException('Invalid cursor');
    }

    const cacheKey = this.projectHealthCacheKey(
      organizationId,
      status,
      cursorRaw,
      limit,
    );
    const cached = await this.readJsonCache<OrgProjectHealthPage>(cacheKey);
    if (cached) return cached;

    const page = await this.queryProjectHealthPage(
      organizationId,
      status,
      decoded,
      limit,
    );
    await this.writeJsonCache(
      cacheKey,
      page,
      DASHBOARD_PROJECT_HEALTH_CACHE_TTL_SECONDS,
    );
    return page;
  }

  /**
   * Member dashboard (everyone except Owner): "own + enrolled" project
   * scope, per-user cache key. Mirrors getOrgOwnerDashboard's cache/lock
   * pattern.
   */
  async getMemberDashboard(
    organizationId: string,
    userId: string,
    range: DashboardRange = '7d',
    filters?: MemberDashboardProjectFilters,
  ): Promise<MemberDashboardResponse> {
    this.scopeResolver.resolveProjectScope('org_user');

    const key = this.memberCacheKey(organizationId, userId, range, filters);
    const cached = await this.readJsonCache<MemberDashboardResponse>(key);
    if (cached) {
      return { ...cached, meta: { ...cached.meta, cacheHit: true } };
    }

    const lockKey = `${key}:lock`;
    const acquired = await this.tryAcquireLock(lockKey);
    if (!acquired) {
      await sleep(120);
      const afterWait = await this.readJsonCache<MemberDashboardResponse>(key);
      if (afterWait) {
        return { ...afterWait, meta: { ...afterWait.meta, cacheHit: true } };
      }
    }

    try {
      const built = await this.buildMemberDashboard(
        organizationId,
        userId,
        range,
        filters,
      );
      await this.writeJsonCache(key, built, DASHBOARD_CACHE_TTL_SECONDS);
      return built;
    } finally {
      if (acquired) {
        await this.releaseLock(lockKey);
      }
    }
  }

  /** List of the caller's own/enrolled projects, for the dashboard's project filter dropdown. */
  async getMemberScopedProjects(
    organizationId: string,
    userId: string,
  ): Promise<MemberScopedProject[]> {
    const rows: MemberScopedProjectRow[] = await this.dataSource.query(
      `
      WITH ${MEMBER_SCOPED_PROJECTS_CTE}
      SELECT p.id, p.name, p.key
      FROM projects p
      INNER JOIN member_scoped_projects msp ON msp.project_id = p.id
      ORDER BY p.name ASC
      `,
      [organizationId, userId],
    );
    return rows.map((row) => ({ id: row.id, name: row.name, key: row.key }));
  }

  /**
   * Fixed-budget aggregation: exactly 4 parallel DB round-trips.
   * Each of `filters.issueStatusProjectId` / `activeSprintProjectId` /
   * `teamWorkloadProjectId` independently narrows its own widget to a
   * single scoped project — those widgets filter independently of one
   * another. KPIs and the active-project count always stay org/member-wide.
   * "Recent Project Activity" is intentionally NOT included here — it's
   * keyset-paged (infinite scroll) via the separate getMemberActivityFeed,
   * mirroring how project health rows are paged outside this aggregate.
   */
  async buildMemberDashboard(
    organizationId: string,
    userId: string,
    range: DashboardRange,
    filters?: MemberDashboardProjectFilters,
  ): Promise<MemberDashboardResponse> {
    this.lastQueryCount = 0;

    const [kpiRows, activeProjectsRows, sprintRows, workloadRows] =
      await Promise.all([
        this.queryMemberKpisAndIssueStatus(
          organizationId,
          userId,
          filters?.issueStatusProjectId,
        ),
        this.queryMemberActiveProjectsCount(organizationId, userId),
        this.queryMemberActiveSprints(
          organizationId,
          userId,
          filters?.activeSprintProjectId,
        ),
        this.queryMemberTeamWorkload(
          organizationId,
          userId,
          filters?.teamWorkloadProjectId,
        ),
      ]);

    this.lastQueryCount = 4;

    const kpiRow = kpiRows[0] ?? {
      total_projects: 0,
      total_members: 0,
      open_issues: 0,
      overdue_issues: 0,
      todo_count: 0,
      in_progress_count: 0,
      blocked_count: 0,
      done_count: 0,
    };
    const activeProjects = toInt(activeProjectsRows[0]?.active_count);

    const issueStatus = this.buildIssueStatusDonut(kpiRow);
    const activeSprints = sprintRows.map((row) => this.toActiveSprint(row));
    const teamWorkload = this.buildTeamWorkload(workloadRows);

    return {
      kpis: {
        totalProjects: toInt(kpiRow.total_projects),
        activeProjects,
        totalMembers: toInt(kpiRow.total_members),
        openIssues: toInt(kpiRow.open_issues),
        overdueIssues: toInt(kpiRow.overdue_issues),
      },
      issueStatus,
      activeSprints,
      teamWorkload,
      meta: {
        range,
        generatedAt: new Date().toISOString(),
        variant: 'org_user',
        cacheHit: false,
      },
    };
  }

  /**
   * Keyset-paged "Recent Project Activity" scoped to the caller's own +
   * enrolled projects, optionally narrowed to a single project. Infinite
   * scroll, independent of buildMemberDashboard's fixed query budget —
   * mirrors getMemberProjectHealth's pagination pattern.
   */
  async getMemberActivityFeed(
    organizationId: string,
    userId: string,
    options: { projectId?: string; cursor?: string; limit?: number } = {},
  ): Promise<MemberActivityFeedPage> {
    const limit = Math.min(
      MEMBER_ACTIVITY_PAGE_MAX,
      Math.max(1, options.limit ?? MEMBER_ACTIVITY_PAGE_DEFAULT),
    );
    const cursorRaw = options.cursor?.trim() || '';
    const decoded = decodeActivityFeedCursor(cursorRaw || null);
    if (cursorRaw && !decoded) {
      throw new BadRequestException('Invalid cursor');
    }

    const rows = await this.queryMemberActivityFeedPage(
      organizationId,
      userId,
      options.projectId,
      decoded,
      limit,
    );
    const items = rows.map((row) => this.toFeedItem(row));

    let nextCursor: string | null = null;
    if (rows.length === limit) {
      const last = rows[rows.length - 1];
      const createdAt =
        last.created_at instanceof Date
          ? last.created_at.toISOString()
          : new Date(last.created_at).toISOString();
      nextCursor = encodeActivityFeedCursor({ createdAt, id: last.id });
    }

    return { items, nextCursor };
  }

  /**
   * Keyset-paged project health rows scoped to the caller's own + enrolled
   * projects (mirrors getOrgProjectHealth).
   */
  async getMemberProjectHealth(
    organizationId: string,
    userId: string,
    options: {
      status?: ProjectHealthStatus | 'all';
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<OrgProjectHealthPage> {
    this.scopeResolver.resolveProjectScope('org_user');

    const status = options.status ?? 'all';
    if (status !== 'all' && !isProjectHealthStatus(status)) {
      throw new BadRequestException('Invalid status filter');
    }

    const limit = Math.min(
      PROJECT_HEALTH_PAGE_MAX,
      Math.max(1, options.limit ?? PROJECT_HEALTH_PAGE_DEFAULT),
    );
    const cursorRaw = options.cursor?.trim() || '';
    const decoded = decodeProjectHealthCursor(cursorRaw || null);
    if (cursorRaw && !decoded) {
      throw new BadRequestException('Invalid cursor');
    }

    const cacheKey = this.memberProjectHealthCacheKey(
      organizationId,
      userId,
      status,
      cursorRaw,
      limit,
    );
    const cached = await this.readJsonCache<OrgProjectHealthPage>(cacheKey);
    if (cached) return cached;

    const page = await this.queryMemberProjectHealthPage(
      organizationId,
      userId,
      status,
      decoded,
      limit,
    );
    await this.writeJsonCache(
      cacheKey,
      page,
      DASHBOARD_PROJECT_HEALTH_CACHE_TTL_SECONDS,
    );
    return page;
  }

  private buildIssueStatusDonut(row: MemberKpiRow): IssueStatusDonut {
    const counts: Record<IssueStatusBucket, number> = {
      todo: toInt(row.todo_count),
      in_progress: toInt(row.in_progress_count),
      blocked: toInt(row.blocked_count),
      done: toInt(row.done_count),
    };
    const order: IssueStatusBucket[] = [
      'todo',
      'in_progress',
      'blocked',
      'done',
    ];
    const total = order.reduce((sum, k) => sum + counts[k], 0);
    return {
      total,
      segments: order.map((key) => ({
        key,
        count: counts[key],
        percent: total > 0 ? Math.round((counts[key] / total) * 100) : 0,
      })),
    };
  }

  private toActiveSprint(row: MemberActiveSprintRow): ActiveSprintSummary {
    const total = toInt(row.total_issues);
    const done = toInt(row.done_issues);
    const progressPercent = total > 0 ? Math.round((done / total) * 100) : 0;

    let daysLeft: number | null = null;
    if (row.end_date) {
      const end = new Date(row.end_date);
      const now = new Date();
      const nowUtc = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      );
      const endUtc = Date.UTC(
        end.getUTCFullYear(),
        end.getUTCMonth(),
        end.getUTCDate(),
      );
      daysLeft = Math.max(
        0,
        Math.round((endUtc - nowUtc) / (24 * 60 * 60 * 1000)),
      );
    }

    return {
      sprintId: row.sprint_id,
      name: row.name,
      projectId: row.project_id,
      projectName: row.project_name,
      startDate: row.start_date,
      endDate: row.end_date,
      totalIssues: total,
      doneIssues: done,
      progressPercent,
      daysLeft,
    };
  }

  private buildTeamWorkload(rows: MemberWorkloadRow[]): TeamWorkload {
    const members: WorkloadMember[] = rows.map((row) => {
      const activeCount = toInt(row.active_count);
      return {
        userId: row.user_id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        activeCount,
        inProgressCount: toInt(row.in_progress_count),
        doneCount: toInt(row.done_count),
        overdueCount: toInt(row.overdue_count),
        capacity: classifyWorkloadCapacity(activeCount),
      };
    });

    const topBusiest = members.slice(0, TEAM_WORKLOAD_TOP_BUSIEST_LIMIT);
    const capacitySummary = members.reduce(
      (acc, m) => {
        if (m.capacity === 'available') acc.available += 1;
        else if (m.capacity === 'near_capacity') acc.nearCapacity += 1;
        else acc.overloaded += 1;
        return acc;
      },
      { available: 0, nearCapacity: 0, overloaded: 0 },
    );

    return { members, topBusiest, capacitySummary };
  }

  /**
   * Q1 — KPI scalars + issue-status donut counts (1 round-trip).
   * `total_projects`/`total_members`/`open_issues`/`overdue_issues` (KPI
   * cards) always reflect the full member scope; the donut buckets
   * (`todo_count`/`in_progress_count`/`blocked_count`/`done_count`) respect
   * `projectId` via the `in_filter` flag so "Open Issues by Status" alone
   * narrows to the selected project.
   */
  private async queryMemberKpisAndIssueStatus(
    organizationId: string,
    userId: string,
    projectId?: string,
  ): Promise<MemberKpiRow[]> {
    return this.dataSource.query(
      `
      WITH ${MEMBER_SCOPED_PROJECTS_CTE},
      issue_pool AS (
        SELECT
          i.id,
          i.due_date,
          i.project_id,
          s.category,
          EXISTS (
            SELECT 1 FROM issue_links l
            WHERE (
              (l.source_issue_id = i.id AND l.link_type = 'is_blocked_by')
              OR (l.target_issue_id = i.id AND l.link_type = 'blocks')
            )
          ) AS is_blocked
        FROM issues i
        INNER JOIN member_scoped_projects msp ON msp.project_id = i.project_id
        LEFT JOIN issue_statuses s ON s.id = i.status_id
        WHERE i.organization_id = $1
          AND i.deleted_at IS NULL
      ),
      status_buckets AS (
        SELECT
          CASE
            WHEN category = 'done' THEN 'done'
            WHEN is_blocked THEN 'blocked'
            WHEN category = 'in_progress' THEN 'in_progress'
            ELSE 'todo'
          END AS bucket,
          due_date,
          category,
          ($3::uuid IS NULL OR project_id = $3) AS in_filter
        FROM issue_pool
      ),
      member_people AS (
        SELECT pm.user_id
        FROM project_members pm
        INNER JOIN member_scoped_projects msp ON msp.project_id = pm.project_id
        UNION
        SELECT p.owner_id
        FROM projects p
        INNER JOIN member_scoped_projects msp ON msp.project_id = p.id
      )
      SELECT
        (SELECT COUNT(*)::int FROM member_scoped_projects) AS total_projects,
        (SELECT COUNT(DISTINCT user_id)::int FROM member_people) AS total_members,
        (SELECT COUNT(*)::int FROM status_buckets WHERE category IS DISTINCT FROM 'done') AS open_issues,
        (SELECT COUNT(*)::int FROM status_buckets
          WHERE category IS DISTINCT FROM 'done' AND due_date < CURRENT_DATE
        ) AS overdue_issues,
        (SELECT COUNT(*)::int FROM status_buckets WHERE bucket = 'todo' AND in_filter) AS todo_count,
        (SELECT COUNT(*)::int FROM status_buckets WHERE bucket = 'in_progress' AND in_filter) AS in_progress_count,
        (SELECT COUNT(*)::int FROM status_buckets WHERE bucket = 'blocked' AND in_filter) AS blocked_count,
        (SELECT COUNT(*)::int FROM status_buckets WHERE bucket = 'done' AND in_filter) AS done_count
      `,
      [organizationId, userId, projectId ?? null],
    );
  }

  /** Q2 — active-project count via the same health classification as the Owner dashboard (1 round-trip). */
  private async queryMemberActiveProjectsCount(
    organizationId: string,
    userId: string,
  ): Promise<MemberActiveProjectsRow[]> {
    return this.dataSource.query(
      `
      WITH ${MEMBER_SCOPED_PROJECTS_CTE},
      ${MEMBER_PROJECT_HEALTH_ROLLUP_CTE},
      classified AS (
        SELECT (${PROJECT_HEALTH_STATUS_SQL.trim()}) AS health_status
        FROM project_rollups
      )
      SELECT COUNT(*)::int AS active_count
      FROM classified
      WHERE health_status = 'active'
      `,
      [organizationId, userId],
    );
  }

  /** Q3 — active sprints across scoped projects, optionally narrowed to one project (1 round-trip). */
  private async queryMemberActiveSprints(
    organizationId: string,
    userId: string,
    projectId?: string,
  ): Promise<MemberActiveSprintRow[]> {
    return this.dataSource.query(
      `
      WITH ${buildMemberScopedProjectsCte(3)}
      SELECT
        sp.id AS sprint_id,
        sp.name,
        p.id AS project_id,
        p.name AS project_name,
        sp.start_date,
        sp.end_date,
        COUNT(i.id) FILTER (WHERE i.deleted_at IS NULL) AS total_issues,
        COUNT(i.id) FILTER (
          WHERE i.deleted_at IS NULL AND s.category = 'done'
        ) AS done_issues
      FROM sprints sp
      INNER JOIN member_scoped_projects msp ON msp.project_id = sp.project_id
      INNER JOIN projects p ON p.id = sp.project_id
      LEFT JOIN issues i ON i.sprint_id = sp.id AND i.organization_id = $1
      LEFT JOIN issue_statuses s ON s.id = i.status_id
      WHERE sp.status = 'active'
      GROUP BY sp.id, sp.name, p.id, p.name, sp.start_date, sp.end_date
      ORDER BY sp.end_date ASC NULLS LAST
      LIMIT ${MEMBER_ACTIVE_SPRINTS_LIMIT}
      `,
      [organizationId, userId, projectId ?? null],
    );
  }

  /** Q4 — per-assignee workload across scoped projects, optionally narrowed to one project (1 round-trip). */
  private async queryMemberTeamWorkload(
    organizationId: string,
    userId: string,
    projectId?: string,
  ): Promise<MemberWorkloadRow[]> {
    return this.dataSource.query(
      `
      WITH ${buildMemberScopedProjectsCte(3)},
      scoped_issues AS (
        SELECT i.id, i.assignee_id, i.due_date, s.category
        FROM issues i
        INNER JOIN member_scoped_projects msp ON msp.project_id = i.project_id
        LEFT JOIN issue_statuses s ON s.id = i.status_id
        WHERE i.organization_id = $1
          AND i.deleted_at IS NULL
          AND i.assignee_id IS NOT NULL
      )
      SELECT
        u.id AS user_id,
        u.display_name,
        u.avatar_url,
        COUNT(si.id) FILTER (WHERE si.category IS DISTINCT FROM 'done')::int AS active_count,
        COUNT(si.id) FILTER (WHERE si.category = 'in_progress')::int AS in_progress_count,
        COUNT(si.id) FILTER (WHERE si.category = 'done')::int AS done_count,
        COUNT(si.id) FILTER (
          WHERE si.category IS DISTINCT FROM 'done' AND si.due_date < CURRENT_DATE
        )::int AS overdue_count
      FROM scoped_issues si
      INNER JOIN users u ON u.id = si.assignee_id
      GROUP BY u.id, u.display_name, u.avatar_url
      ORDER BY active_count DESC
      `,
      [organizationId, userId, projectId ?? null],
    );
  }

  /**
   * Keyset-paged recent activity feed scoped to member's own + enrolled
   * projects, optionally narrowed to one project. Ordered by
   * (created_at DESC, id DESC) — id is the tiebreaker for rows sharing a
   * timestamp, keeping pagination stable.
   */
  private async queryMemberActivityFeedPage(
    organizationId: string,
    userId: string,
    projectId: string | undefined,
    cursor: ActivityFeedCursorPayload | null,
    limit: number,
  ): Promise<ActivityFeedRow[]> {
    const params: unknown[] = [
      organizationId,
      userId,
      [...DASHBOARD_ACTIVITY_ACTIONS],
    ];

    let cursorClause = '';
    if (cursor) {
      params.push(cursor.createdAt, cursor.id);
      const pId = params.length;
      const pCreatedAt = pId - 1;
      cursorClause = `
        AND (
          a.created_at < $${pCreatedAt}
          OR (a.created_at = $${pCreatedAt} AND a.id < $${pId})
        )`;
    }

    params.push(limit);
    const limitParam = `$${params.length}`;
    params.push(projectId ?? null);
    const projectIdParam = params.length;

    return this.dataSource.query(
      `
      WITH ${buildMemberScopedProjectsCte(projectIdParam)}
      SELECT
        a.id,
        a.user_id,
        u.display_name AS user_display_name,
        u.avatar_url AS user_avatar_url,
        a.action,
        i.key AS issue_key,
        i.title AS issue_title,
        p.key AS project_key,
        a.created_at
      FROM activities a
      INNER JOIN issues i
        ON i.id = a.issue_id
       AND i.organization_id = a.organization_id
      INNER JOIN member_scoped_projects msp ON msp.project_id = i.project_id
      LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN projects p
        ON p.id = i.project_id
       AND p.organization_id = a.organization_id
      WHERE a.organization_id = $1
        AND a.action = ANY($3::text[])
        ${cursorClause}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ${limitParam}
      `,
      params,
    );
  }

  /** Keyset-paged project health rows, scoped to member's own + enrolled projects. */
  private async queryMemberProjectHealthPage(
    organizationId: string,
    userId: string,
    status: ProjectHealthStatus | 'all',
    cursor: ReturnType<typeof decodeProjectHealthCursor>,
    limit: number,
  ): Promise<OrgProjectHealthPage> {
    const params: unknown[] = [organizationId, userId];
    let statusClause = '';
    if (status !== 'all') {
      params.push(status);
      statusClause = `AND health_status = $${params.length}`;
    }

    let cursorClause = '';
    if (cursor) {
      params.push(cursor.sortOrder, cursor.name, cursor.projectId);
      const pId = params.length;
      const pName = pId - 1;
      const pSort = pId - 2;
      cursorClause = `
        AND (
          sort_order > $${pSort}
          OR (sort_order = $${pSort} AND name > $${pName})
          OR (sort_order = $${pSort} AND name = $${pName} AND project_id > $${pId})
        )`;
    }

    params.push(limit);
    const limitParam = `$${params.length}`;

    const rows: ProjectHealthSqlRow[] = await this.dataSource.query(
      `
      WITH ${MEMBER_SCOPED_PROJECTS_CTE},
      ${MEMBER_PROJECT_HEALTH_ROLLUP_CTE},
      classified AS (
        SELECT
          project_id,
          name,
          key,
          type,
          open_tickets,
          blocked_open_tickets,
          overdue_tickets,
          completed_tickets,
          active_sprint_name,
          (${PROJECT_HEALTH_STATUS_SQL.trim()}) AS health_status,
          (${PROJECT_HEALTH_PROGRESS_SQL.trim()}) AS progress_percent
        FROM project_rollups
      ),
      ranked AS (
        SELECT
          c.*,
          (${PROJECT_HEALTH_SORT_RANK_SQL.trim()}) AS sort_order
        FROM classified c
      ),
      filtered AS (
        SELECT *
        FROM ranked
        WHERE 1=1
          ${statusClause}
      ),
      meta AS (
        SELECT COUNT(*)::int AS total_count FROM filtered
      ),
      paged AS (
        SELECT *
        FROM filtered
        WHERE 1=1
          ${cursorClause}
        ORDER BY sort_order ASC, name ASC, project_id ASC
        LIMIT ${limitParam}
      )
      SELECT
        p.project_id,
        p.name,
        p.key,
        p.type,
        p.open_tickets,
        p.blocked_open_tickets,
        p.overdue_tickets,
        p.completed_tickets,
        p.active_sprint_name,
        p.health_status,
        p.progress_percent,
        p.sort_order,
        m.total_count
      FROM meta m
      LEFT JOIN paged p ON TRUE
      ORDER BY p.sort_order ASC NULLS LAST, p.name ASC NULLS LAST, p.project_id ASC NULLS LAST
      `,
      params,
    );

    const total = rows.length > 0 ? toInt(rows[0].total_count) : 0;
    const dataRows = rows.filter((r) => r.project_id != null);
    const items: ProjectHealthRow[] = dataRows.map((row) => {
      const status = isProjectHealthStatus(row.health_status)
        ? row.health_status
        : null;
      return {
        projectId: row.project_id,
        name: row.name,
        key: row.key,
        type: row.type,
        openIssues: toInt(row.open_tickets),
        blockedIssues: toInt(row.blocked_open_tickets),
        overdueIssues: toInt(row.overdue_tickets),
        doneIssues: toInt(row.completed_tickets),
        activeSprintName: row.active_sprint_name,
        status: status ?? 'at_risk',
        progressPercent: toInt(row.progress_percent),
      };
    });

    let nextCursor: string | null = null;
    if (dataRows.length === limit) {
      const last = dataRows[dataRows.length - 1];
      nextCursor = encodeProjectHealthCursor({
        sortOrder: toInt(last.sort_order),
        name: last.name,
        projectId: last.project_id,
      });
    }

    return { items, nextCursor, total };
  }

  private buildDonutFromCounts(rows: StatusCountRow[]): DonutSection {
    const counts = Object.fromEntries(
      PROJECT_HEALTH_CHART_KEYS.map((k) => [k, 0]),
    ) as Record<ProjectHealthStatus, number>;
    for (const row of rows) {
      if (isProjectHealthStatus(row.health_status)) {
        counts[row.health_status] += toInt(row.cnt);
      }
    }
    const total = PROJECT_HEALTH_CHART_KEYS.reduce(
      (sum, k) => sum + counts[k],
      0,
    );
    const segments: HealthSegment[] = PROJECT_HEALTH_CHART_KEYS.map((key) => ({
      key,
      count: counts[key],
      percent: total > 0 ? Math.round((counts[key] / total) * 100) : 0,
    }));
    return { total, segments };
  }

  private toFeedItem(row: ActivityFeedRow): ActivityFeedItem {
    const createdAt =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString();
    return {
      id: row.id,
      userId: row.user_id,
      userDisplayName: row.user_display_name,
      userAvatarUrl: row.user_avatar_url,
      action: row.action,
      target: row.issue_title || row.issue_key || 'Issue',
      targetType: 'issue',
      issueKey: row.issue_key,
      projectKey: row.project_key,
      createdAt,
    };
  }

  private fillSeries(
    from: Date,
    days: number,
    rows: ActivityDayRow[],
  ): { date: string; count: number }[] {
    const map = new Map<string, number>();
    for (const row of rows) {
      const key =
        typeof row.day === 'string'
          ? row.day.slice(0, 10)
          : new Date(row.day).toISOString().slice(0, 10);
      map.set(key, toInt(row.count));
    }
    const series: { date: string; count: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setUTCDate(from.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      series.push({ date: key, count: map.get(key) ?? 0 });
    }
    return series;
  }

  /**
   * Q1 — KPI scalars + Member Management Snapshot (1 round-trip).
   * Role buckets use distinct-user + highest-role precedence (see
   * member-snapshot.constants.ts). Trends A use current UTC month.
   */
  private async queryKpis(organizationId: string): Promise<KpiRow[]> {
    return this.dataSource.query(
      `
      WITH month_start AS (
        SELECT date_trunc('month', (NOW() AT TIME ZONE 'UTC')) AS ts
      ),
      org_members AS (
        SELECT om.user_id, om.role AS org_role, om.created_at
        FROM organization_members om
        WHERE om.organization_id = $1
      ),
      highest_project_role AS (
        SELECT
          pm.user_id,
          CASE
            WHEN bool_or(pm.role = 'admin') THEN 'admin'
            WHEN bool_or(pm.role = 'member') THEN 'member'
            WHEN bool_or(pm.role = 'viewer') THEN 'viewer'
            ELSE NULL
          END AS project_role
        FROM project_members pm
        INNER JOIN projects p
          ON p.id = pm.project_id
         AND p.organization_id = $1
        INNER JOIN org_members om ON om.user_id = pm.user_id
        GROUP BY pm.user_id
      ),
      classified AS (
        SELECT
          om.user_id,
          CASE
            WHEN om.org_role = 'owner' THEN 'org_owner'
            WHEN om.org_role = 'administrator' THEN 'org_administrator'
            WHEN hpr.project_role = 'admin' THEN 'project_admin'
            WHEN hpr.project_role = 'member' THEN 'project_member'
            WHEN hpr.project_role = 'viewer' THEN 'project_viewer'
            ELSE 'org_user'
          END AS bucket
        FROM org_members om
        LEFT JOIN highest_project_role hpr ON hpr.user_id = om.user_id
      ),
      role_counts AS (
        SELECT bucket, COUNT(*)::int AS cnt
        FROM classified
        GROUP BY bucket
      )
      SELECT
        (SELECT COUNT(*)::int FROM projects p WHERE p.organization_id = $1) AS total_projects,
        (SELECT COUNT(*)::int FROM org_members) AS total_members,
        (SELECT COUNT(*)::int FROM users u
          WHERE u.invitation_status = 'pending'
            AND (u.organization_id = $1 OR u.pending_invite_organization_id = $1)
        ) AS pending_invites,
        s.status AS billing_status,
        bp.name AS billing_plan_name,
        (SELECT COUNT(*)::int FROM org_members om
          WHERE om.created_at >= (SELECT ts FROM month_start)
        ) AS members_added_this_month,
        (SELECT COUNT(*)::int FROM users u
          WHERE u.invitation_status = 'pending'
            AND (u.organization_id = $1 OR u.pending_invite_organization_id = $1)
            AND u.created_at >= (SELECT ts FROM month_start)
        ) AS pending_created_this_month,
        (SELECT COUNT(*)::int FROM users u
          WHERE u.invitation_status = 'accepted'
            AND u.organization_id = $1
            AND u.updated_at >= (SELECT ts FROM month_start)
        ) AS invites_accepted_this_month,
        (SELECT COUNT(*)::int FROM users u
          WHERE u.invitation_status = 'pending'
            AND (u.organization_id = $1 OR u.pending_invite_organization_id = $1)
            AND u.email_verification_expiry IS NOT NULL
            AND u.email_verification_expiry > NOW()
        ) AS active_invitations,
        (SELECT MIN(u.email_verification_expiry) FROM users u
          WHERE u.invitation_status = 'pending'
            AND (u.organization_id = $1 OR u.pending_invite_organization_id = $1)
            AND u.email_verification_expiry IS NOT NULL
            AND u.email_verification_expiry > NOW()
        ) AS next_invite_expiry_at,
        COALESCE(
          (SELECT json_object_agg(rc.bucket, rc.cnt) FROM role_counts rc),
          '{}'::json
        ) AS role_counts
      FROM (SELECT 1) AS _
      LEFT JOIN subscriptions s ON s.organization_id = $1
      LEFT JOIN billing_plans bp ON bp.id = s.plan_id
      `,
      [organizationId],
    );
  }

  /** Q2 — project health status counts only (1 round-trip, set-based) */
  private async queryProjectStatusCounts(
    organizationId: string,
  ): Promise<StatusCountRow[]> {
    return this.dataSource.query(
      `
      WITH ${PROJECT_HEALTH_ROLLUP_CTE},
      classified AS (
        SELECT
          (${PROJECT_HEALTH_STATUS_SQL.trim()}) AS health_status
        FROM project_rollups
      )
      SELECT health_status, COUNT(*)::int AS cnt
      FROM classified
      GROUP BY health_status
      `,
      [organizationId],
    );
  }

  private async queryProjectHealthPage(
    organizationId: string,
    status: ProjectHealthStatus | 'all',
    cursor: ReturnType<typeof decodeProjectHealthCursor>,
    limit: number,
  ): Promise<OrgProjectHealthPage> {
    const params: unknown[] = [organizationId];
    let statusClause = '';
    if (status !== 'all') {
      params.push(status);
      statusClause = `AND health_status = $${params.length}`;
    }

    let cursorClause = '';
    if (cursor) {
      params.push(cursor.sortOrder, cursor.name, cursor.projectId);
      const pId = params.length;
      const pName = pId - 1;
      const pSort = pId - 2;
      cursorClause = `
        AND (
          sort_order > $${pSort}
          OR (sort_order = $${pSort} AND name > $${pName})
          OR (sort_order = $${pSort} AND name = $${pName} AND project_id > $${pId})
        )`;
    }

    params.push(limit);
    const limitParam = `$${params.length}`;

    const rows: ProjectHealthSqlRow[] = await this.dataSource.query(
      `
      WITH ${PROJECT_HEALTH_ROLLUP_CTE},
      classified AS (
        SELECT
          project_id,
          name,
          key,
          type,
          open_tickets,
          blocked_open_tickets,
          overdue_tickets,
          completed_tickets,
          active_sprint_name,
          (${PROJECT_HEALTH_STATUS_SQL.trim()}) AS health_status,
          (${PROJECT_HEALTH_PROGRESS_SQL.trim()}) AS progress_percent
        FROM project_rollups
      ),
      ranked AS (
        SELECT
          c.*,
          (${PROJECT_HEALTH_SORT_RANK_SQL.trim()}) AS sort_order
        FROM classified c
      ),
      filtered AS (
        SELECT *
        FROM ranked
        WHERE 1=1
          ${statusClause}
      ),
      meta AS (
        SELECT COUNT(*)::int AS total_count FROM filtered
      ),
      paged AS (
        SELECT *
        FROM filtered
        WHERE 1=1
          ${cursorClause}
        ORDER BY sort_order ASC, name ASC, project_id ASC
        LIMIT ${limitParam}
      )
      SELECT
        p.project_id,
        p.name,
        p.key,
        p.type,
        p.open_tickets,
        p.blocked_open_tickets,
        p.overdue_tickets,
        p.completed_tickets,
        p.active_sprint_name,
        p.health_status,
        p.progress_percent,
        p.sort_order,
        m.total_count
      FROM meta m
      LEFT JOIN paged p ON TRUE
      ORDER BY p.sort_order ASC NULLS LAST, p.name ASC NULLS LAST, p.project_id ASC NULLS LAST
      `,
      params,
    );

    const total = rows.length > 0 ? toInt(rows[0].total_count) : 0;
    const dataRows = rows.filter((r) => r.project_id != null);
    const items: ProjectHealthRow[] = dataRows.map((row) => {
      const status = isProjectHealthStatus(row.health_status)
        ? row.health_status
        : null;
      if (!status) {
        this.logger.warn(
          `Unknown project health status "${row.health_status}" for project ${row.project_id}; treating as at_risk`,
        );
      }
      return {
        projectId: row.project_id,
        name: row.name,
        key: row.key,
        type: row.type,
        openIssues: toInt(row.open_tickets),
        blockedIssues: toInt(row.blocked_open_tickets),
        overdueIssues: toInt(row.overdue_tickets),
        doneIssues: toInt(row.completed_tickets),
        activeSprintName: row.active_sprint_name,
        status: status ?? 'at_risk',
        progressPercent: toInt(row.progress_percent),
      };
    });

    let nextCursor: string | null = null;
    if (dataRows.length === limit) {
      const last = dataRows[dataRows.length - 1];
      nextCursor = encodeProjectHealthCursor({
        sortOrder: toInt(last.sort_order),
        name: last.name,
        projectId: last.project_id,
      });
    }

    return { items, nextCursor, total };
  }

  /** Q3 — activity series (1 round-trip) */
  private async queryActivitySeries(
    organizationId: string,
    from: Date,
  ): Promise<ActivityDayRow[]> {
    return this.dataSource.query(
      `
      SELECT date_trunc('day', a.created_at AT TIME ZONE 'UTC')::date::text AS day,
             COUNT(*)::int AS count
      FROM activities a
      WHERE a.organization_id = $1
        AND a.created_at >= $2
        AND a.action = ANY($3::text[])
      GROUP BY 1
      ORDER BY 1 ASC
      `,
      [organizationId, from.toISOString(), [...DASHBOARD_ACTIVITY_ACTIONS]],
    );
  }

  /** Q4 — recent activity feed (1 round-trip, LIMIT 6) */
  private async queryActivityFeed(
    organizationId: string,
  ): Promise<ActivityFeedRow[]> {
    return this.dataSource.query(
      `
      SELECT
        a.id,
        a.user_id,
        u.display_name AS user_display_name,
        u.avatar_url AS user_avatar_url,
        a.action,
        i.key AS issue_key,
        i.title AS issue_title,
        p.key AS project_key,
        a.created_at
      FROM activities a
      LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN issues i
        ON i.id = a.issue_id
       AND i.organization_id = a.organization_id
      LEFT JOIN projects p
        ON p.id = i.project_id
       AND p.organization_id = a.organization_id
      WHERE a.organization_id = $1
        AND a.action = ANY($2::text[])
      ORDER BY a.created_at DESC
      LIMIT $3
      `,
      [
        organizationId,
        [...DASHBOARD_ACTIVITY_ACTIONS],
        DASHBOARD_ACTIVITY_FEED_LIMIT,
      ],
    );
  }

  private async readCache(
    key: string,
  ): Promise<OrgDashboardResponse | null> {
    return this.readJsonCache<OrgDashboardResponse>(key);
  }

  private async writeCache(
    key: string,
    value: OrgDashboardResponse,
  ): Promise<void> {
    const toStore: OrgDashboardResponse = {
      ...value,
      meta: { ...value.meta, cacheHit: false },
    };
    await this.writeJsonCache(key, toStore, DASHBOARD_CACHE_TTL_SECONDS);
  }

  private async readJsonCache<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(`Dashboard cache read failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async writeJsonCache(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (err) {
      this.logger.warn(`Dashboard cache write failed: ${(err as Error).message}`);
    }
  }
}

function toInt(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseRoleCounts(
  raw: Record<string, number> | string | null | undefined,
): Partial<Record<string, number>> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
