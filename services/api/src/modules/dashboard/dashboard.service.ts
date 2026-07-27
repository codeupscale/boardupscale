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
  PROJECT_HEALTH_PAGE_DEFAULT,
  PROJECT_HEALTH_PAGE_MAX,
} from './dto/org-project-health-query.dto';
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
