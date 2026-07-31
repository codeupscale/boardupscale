import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardScopeResolver } from './dashboard-scope.resolver';
import { OrgDashboardResponse } from './dto/org-dashboard-response';
import {
  encodeProjectHealthCursor,
  decodeProjectHealthCursor,
} from './project-health.sql';

describe('DashboardService', () => {
  let service: DashboardService;
  let dataSource: { query: jest.Mock };
  let configService: { get: jest.Mock };

  const emptyKpis = [
    {
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
    },
  ];

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    configService = { get: jest.fn().mockReturnValue(undefined) };

    service = new DashboardService(
      dataSource as unknown as DataSource,
      new DashboardScopeResolver(),
      configService as unknown as ConfigService,
    );
    (service as unknown as { redis: null }).redis = null;
  });

  it('buildOrgOwnerDashboard issues exactly 4 queries (no N+1)', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          total_projects: 2,
          total_members: 5,
          pending_invites: 1,
          billing_status: 'active',
          billing_plan_name: 'Business',
          members_added_this_month: 2,
          pending_created_this_month: 1,
          invites_accepted_this_month: 3,
          active_invitations: 1,
          next_invite_expiry_at: '2026-07-26T12:00:00.000Z',
          role_counts: {
            org_owner: 1,
            org_administrator: 1,
            project_admin: 1,
            project_member: 1,
            project_viewer: 0,
            org_user: 1,
          },
        },
      ])
      .mockResolvedValueOnce([
        { health_status: 'active', cnt: 1 },
        { health_status: 'at_risk', cnt: 1 },
      ])
      .mockResolvedValueOnce([{ day: '2026-07-20', count: 3 }])
      .mockResolvedValueOnce([
        {
          id: 'a1',
          user_id: 'u1',
          user_display_name: 'Ada',
          user_avatar_url: null,
          action: 'created',
          issue_key: 'ALP-1',
          issue_title: 'Setup',
          project_key: 'ALP',
          created_at: new Date().toISOString(),
        },
      ]);

    const result = await service.buildOrgOwnerDashboard('org-1', '7d');

    expect(dataSource.query).toHaveBeenCalledTimes(4);
    expect(service.lastQueryCount).toBe(4);
    expect(result.kpis.totalProjects).toBe(2);
    // Active Projects KPI must match Projects by Status "active" segment.
    expect(result.kpis.activeProjects).toBe(1);
    expect(
      result.projectsByStatus.segments.find((s) => s.key === 'active')?.count,
    ).toBe(result.kpis.activeProjects);
    expect(result.kpis.securityAlerts.comingSoon).toBe(true);
    expect(result.projectsByStatus.total).toBe(2);
    expect(result.projectsByStatus.segments.map((s) => s.key)).toEqual([
      'active',
      'at_risk',
      'blocked',
      'completed',
    ]);
    expect(result.memberSnapshot.countingRule).toBe(
      'distinct_user_highest_role',
    );
    expect(result.memberSnapshot.pendingInvitesTrendDelta).toBe(-2);
    expect(result.activity.series).toHaveLength(7);
    expect(result.activity.recent).toHaveLength(1);
    expect(
      (result as OrgDashboardResponse & { projectHealth?: unknown })
        .projectHealth,
    ).toBeUndefined();
  });

  it('returns empty-safe payload when org has no data', async () => {
    dataSource.query
      .mockResolvedValueOnce(emptyKpis)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.buildOrgOwnerDashboard('org-empty', '7d');

    expect(dataSource.query).toHaveBeenCalledTimes(4);
    expect(result.kpis.totalProjects).toBe(0);
    expect(result.projectsByStatus.total).toBe(0);
    expect(result.memberSnapshot.totalMembers).toBe(0);
    expect(result.activity.recent).toEqual([]);
  });

  it('getOrgProjectHealth returns keyset page with nextCursor', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        project_id: 'p1',
        name: 'Alpha',
        key: 'ALP',
        type: 'scrum',
        open_tickets: 1,
        blocked_open_tickets: 0,
        overdue_tickets: 0,
        completed_tickets: 9,
        active_sprint_name: 'S1',
        health_status: 'active',
        progress_percent: 90,
        sort_order: 2,
        total_count: 40,
      },
      {
        project_id: 'p2',
        name: 'Beta',
        key: 'BET',
        type: 'kanban',
        open_tickets: 0,
        blocked_open_tickets: 0,
        overdue_tickets: 0,
        completed_tickets: 0,
        active_sprint_name: null,
        health_status: 'blocked',
        progress_percent: 0,
        sort_order: 0,
        total_count: 40,
      },
    ]);

    const page = await service.getOrgProjectHealth('org-1', {
      status: 'all',
      limit: 2,
    });

    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(40);
    expect(page.nextCursor).toBeTruthy();
    const decoded = decodeProjectHealthCursor(page.nextCursor);
    expect(decoded?.projectId).toBe('p2');
  });

  it('getOrgProjectHealth returns empty page with total 0', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        project_id: null,
        name: null,
        key: null,
        type: null,
        open_tickets: null,
        blocked_open_tickets: null,
        overdue_tickets: null,
        completed_tickets: null,
        active_sprint_name: null,
        health_status: null,
        progress_percent: null,
        sort_order: null,
        total_count: 0,
      },
    ]);

    const page = await service.getOrgProjectHealth('org-1', { limit: 25 });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(page.total).toBe(0);
  });

  it('getOrgProjectHealth rejects invalid cursor', async () => {
    await expect(
      service.getOrgProjectHealth('org-1', { cursor: '%%%not-base64%%%' }),
    ).rejects.toThrow('Invalid cursor');
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('getOrgProjectHealth rejects invalid status', async () => {
    await expect(
      service.getOrgProjectHealth('org-1', {
        status: 'nope' as 'active',
      }),
    ).rejects.toThrow('Invalid status filter');
  });

  it('encodes and decodes project health cursors', () => {
    const encoded = encodeProjectHealthCursor({
      sortOrder: 1,
      name: 'Zed',
      projectId: 'abc',
    });
    expect(decodeProjectHealthCursor(encoded)).toEqual({
      sortOrder: 1,
      name: 'Zed',
      projectId: 'abc',
    });
    expect(decodeProjectHealthCursor('not-valid')).toBeNull();
  });

  it('getOrgOwnerDashboard serves cache without DB queries', async () => {
    const payload = {
      kpis: {
        totalProjects: 1,
        activeProjects: 1,
        totalMembers: 1,
        pendingInvites: 0,
        billingStatus: 'active',
        billingPlanName: 'Free',
        securityAlerts: { count: 0, comingSoon: true as const },
      },
      memberSnapshot: {
        totalMembers: 1,
        membersAddedThisMonth: 0,
        pendingInvites: 0,
        pendingInvitesTrendDelta: 0,
        activeInvitations: 0,
        activeInvitationsHint: null,
        roleDistribution: [
          { key: 'org_owner' as const, count: 1, percent: 100 },
          { key: 'org_administrator' as const, count: 0, percent: 0 },
          { key: 'project_admin' as const, count: 0, percent: 0 },
          { key: 'project_member' as const, count: 0, percent: 0 },
          { key: 'project_viewer' as const, count: 0, percent: 0 },
          { key: 'org_user' as const, count: 0, percent: 0 },
        ],
        countingRule: 'distinct_user_highest_role' as const,
      },
      projectsByStatus: { total: 0, segments: [] },
      activity: { series: [], recent: [] },
      meta: {
        range: '7d' as const,
        generatedAt: new Date().toISOString(),
        variant: 'org_owner' as const,
        cacheHit: false,
      },
    } satisfies OrgDashboardResponse;

    (service as unknown as { redis: { get: jest.Mock; setex: jest.Mock } }).redis =
      {
        get: jest.fn().mockResolvedValue(JSON.stringify(payload)),
        setex: jest.fn(),
      };

    const fromCache = await service.getOrgOwnerDashboard('org-1', '7d');
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(fromCache.meta.cacheHit).toBe(true);
    expect(fromCache.kpis.totalProjects).toBe(1);
  });

  it('fails open to DB when Redis get throws', async () => {
    (service as unknown as { redis: { get: jest.Mock; setex: jest.Mock } }).redis =
      {
        get: jest.fn().mockRejectedValue(new Error('redis down')),
        setex: jest.fn().mockRejectedValue(new Error('redis down')),
      };

    dataSource.query
      .mockResolvedValueOnce(emptyKpis)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.getOrgOwnerDashboard('org-1', '7d');
    expect(dataSource.query).toHaveBeenCalledTimes(4);
    expect(result.meta.cacheHit).toBe(false);
  });

  it('buildMemberDashboard issues exactly 4 queries scoped to org + user', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          total_projects: 3,
          total_members: 4,
          open_issues: 6,
          overdue_issues: 2,
          todo_count: 2,
          in_progress_count: 3,
          blocked_count: 1,
          done_count: 5,
        },
      ])
      .mockResolvedValueOnce([{ active_count: 2 }])
      .mockResolvedValueOnce([
        {
          sprint_id: 's1',
          name: 'Sprint 15',
          project_id: 'p1',
          project_name: 'Website Revamp',
          start_date: '2026-07-01',
          end_date: '2026-07-31',
          total_issues: 10,
          done_issues: 6,
        },
      ])
      .mockResolvedValueOnce([
        {
          user_id: 'u1',
          display_name: 'Faiz Ahmed',
          avatar_url: null,
          active_count: 18,
          in_progress_count: 6,
          done_count: 5,
          overdue_count: 2,
        },
        {
          user_id: 'u2',
          display_name: 'Ali Raza',
          avatar_url: null,
          active_count: 2,
          in_progress_count: 1,
          done_count: 1,
          overdue_count: 0,
        },
      ]);

    const result = await service.buildMemberDashboard(
      'org-1',
      'user-1',
      '7d',
    );

    expect(dataSource.query).toHaveBeenCalledTimes(4);
    for (const call of dataSource.query.mock.calls) {
      expect(call[1]).toEqual(
        expect.arrayContaining(['org-1', 'user-1']),
      );
    }

    expect(result.kpis).toEqual({
      totalProjects: 3,
      activeProjects: 2,
      totalMembers: 4,
      openIssues: 6,
      overdueIssues: 2,
    });
    expect(result.issueStatus.total).toBe(11);
    expect(result.issueStatus.segments).toEqual([
      { key: 'todo', count: 2, percent: Math.round((2 / 11) * 100) },
      {
        key: 'in_progress',
        count: 3,
        percent: Math.round((3 / 11) * 100),
      },
      { key: 'blocked', count: 1, percent: Math.round((1 / 11) * 100) },
      { key: 'done', count: 5, percent: Math.round((5 / 11) * 100) },
    ]);
    expect(result.activeSprints).toHaveLength(1);
    expect(result.activeSprints[0].progressPercent).toBe(60);
    expect(result.teamWorkload.members).toHaveLength(2);
    expect(result.teamWorkload.topBusiest[0].userId).toBe('u1');
    expect(result.teamWorkload.members[0].capacity).toBe('overloaded');
    expect(result.teamWorkload.members[1].capacity).toBe('available');
    expect(result.teamWorkload.capacitySummary).toEqual({
      available: 1,
      nearCapacity: 0,
      overloaded: 1,
    });
    expect(result.meta.variant).toBe('org_user');
  });

  it('buildMemberDashboard forwards each per-widget projectId independently, but not to the active-project count', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          total_projects: 3,
          total_members: 4,
          open_issues: 6,
          overdue_issues: 2,
          todo_count: 1,
          in_progress_count: 1,
          blocked_count: 0,
          done_count: 1,
        },
      ])
      .mockResolvedValueOnce([{ active_count: 2 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.buildMemberDashboard('org-1', 'user-1', '7d', {
      issueStatusProjectId: 'proj-issues',
      activeSprintProjectId: 'proj-sprints',
      teamWorkloadProjectId: 'proj-workload',
    });

    const calls = dataSource.query.mock.calls;
    // Q1 (KPIs + issue-status donut): [org, user, issueStatusProjectId]
    expect(calls[0][1]).toEqual(['org-1', 'user-1', 'proj-issues']);
    // Q2 (active-project count): unaffected by any widget filter
    expect(calls[1][1]).toEqual(['org-1', 'user-1']);
    // Q3 (active sprints): [org, user, activeSprintProjectId]
    expect(calls[2][1]).toEqual(['org-1', 'user-1', 'proj-sprints']);
    // Q4 (team workload): [org, user, teamWorkloadProjectId]
    expect(calls[3][1]).toEqual(['org-1', 'user-1', 'proj-workload']);
  });

  it('getMemberScopedProjects returns the caller\'s own/enrolled projects for the filter dropdown', async () => {
    dataSource.query.mockResolvedValueOnce([
      { id: 'p1', name: 'Website Revamp', key: 'WEB' },
      { id: 'p2', name: 'Mobile App', key: 'MOB' },
    ]);

    const projects = await service.getMemberScopedProjects('org-1', 'user-1');

    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      'org-1',
      'user-1',
    ]);
    expect(projects).toEqual([
      { id: 'p1', name: 'Website Revamp', key: 'WEB' },
      { id: 'p2', name: 'Mobile App', key: 'MOB' },
    ]);
  });

  it('getMemberDashboard cache key varies by per-widget filters (filtered result not served from unfiltered cache)', async () => {
    (
      service as unknown as { redis: { get: jest.Mock; setex: jest.Mock } }
    ).redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn(),
    };

    dataSource.query
      .mockResolvedValueOnce([
        {
          total_projects: 0,
          total_members: 0,
          open_issues: 0,
          overdue_issues: 0,
          todo_count: 0,
          in_progress_count: 0,
          blocked_count: 0,
          done_count: 0,
        },
      ])
      .mockResolvedValueOnce([{ active_count: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.getMemberDashboard('org-1', 'user-1', '7d', {
      teamWorkloadProjectId: 'proj-1',
    });

    const redisGet = (
      service as unknown as { redis: { get: jest.Mock } }
    ).redis.get;
    const [filteredKey] = redisGet.mock.calls[0];
    expect(filteredKey).toContain('proj-1');

    const unfilteredKey = (
      service as unknown as {
        memberCacheKey: (
          organizationId: string,
          userId: string,
          range: '7d' | '30d',
        ) => string;
      }
    ).memberCacheKey('org-1', 'user-1', '7d');
    expect(filteredKey).not.toBe(unfilteredKey);
  });

  it('buildMemberDashboard returns empty-safe payload with no scoped projects', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          total_projects: 0,
          total_members: 0,
          open_issues: 0,
          overdue_issues: 0,
          todo_count: 0,
          in_progress_count: 0,
          blocked_count: 0,
          done_count: 0,
        },
      ])
      .mockResolvedValueOnce([{ active_count: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.buildMemberDashboard(
      'org-1',
      'user-1',
      '7d',
    );

    expect(result.kpis.totalProjects).toBe(0);
    expect(result.issueStatus.total).toBe(0);
    expect(result.activeSprints).toEqual([]);
    expect(result.teamWorkload.members).toEqual([]);
    expect(result.teamWorkload.capacitySummary).toEqual({
      available: 0,
      nearCapacity: 0,
      overloaded: 0,
    });
  });

  it('getMemberProjectHealth returns keyset page scoped to org + user', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        project_id: 'p1',
        name: 'Website Revamp',
        key: 'WEB',
        type: 'scrum',
        open_tickets: 8,
        blocked_open_tickets: 0,
        overdue_tickets: 2,
        completed_tickets: 1,
        active_sprint_name: 'Sprint 15',
        health_status: 'active',
        progress_percent: 60,
        sort_order: 2,
        total_count: 6,
      },
    ]);

    const page = await service.getMemberProjectHealth('org-1', 'user-1', {
      status: 'all',
      limit: 1,
    });

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['org-1', 'user-1']),
    );
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(6);
    expect(page.nextCursor).toBeTruthy();
  });

  it('getMemberProjectHealth rejects invalid status', async () => {
    await expect(
      service.getMemberProjectHealth('org-1', 'user-1', {
        status: 'nope' as 'active',
      }),
    ).rejects.toThrow('Invalid status filter');
  });

  it('getMemberActivityFeed returns a keyset page with nextCursor when a full page comes back', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        id: 'a2',
        user_id: 'u1',
        user_display_name: 'Faiz Ahmed',
        user_avatar_url: null,
        action: 'created',
        issue_key: 'WEB-2',
        issue_title: 'Second',
        project_key: 'WEB',
        created_at: '2026-07-30T10:00:00.000Z',
      },
      {
        id: 'a1',
        user_id: 'u1',
        user_display_name: 'Faiz Ahmed',
        user_avatar_url: null,
        action: 'created',
        issue_key: 'WEB-1',
        issue_title: 'First',
        project_key: 'WEB',
        created_at: '2026-07-30T09:00:00.000Z',
      },
    ]);

    const page = await service.getMemberActivityFeed('org-1', 'user-1', {
      limit: 2,
    });

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['org-1', 'user-1']),
    );
    expect(page.items).toHaveLength(2);
    expect(page.items[0].id).toBe('a2');
    expect(page.nextCursor).toBeTruthy();
  });

  it('getMemberActivityFeed returns nextCursor null when fewer than limit rows come back (end of list)', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        id: 'a1',
        user_id: 'u1',
        user_display_name: 'Faiz Ahmed',
        user_avatar_url: null,
        action: 'created',
        issue_key: 'WEB-1',
        issue_title: 'First',
        project_key: 'WEB',
        created_at: '2026-07-30T09:00:00.000Z',
      },
    ]);

    const page = await service.getMemberActivityFeed('org-1', 'user-1', {
      limit: 5,
    });

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it('getMemberActivityFeed forwards projectId and cursor into the query params', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    const cursor = Buffer.from(
      JSON.stringify({ createdAt: '2026-07-30T09:00:00.000Z', id: 'a1' }),
      'utf8',
    ).toString('base64url');

    await service.getMemberActivityFeed('org-1', 'user-1', {
      projectId: 'proj-1',
      cursor,
      limit: 10,
    });

    const [, params] = dataSource.query.mock.calls[0];
    expect(params).toContain('proj-1');
    expect(params).toContain('2026-07-30T09:00:00.000Z');
    expect(params).toContain('a1');
    expect(params).toContain(10);
  });

  it('getMemberActivityFeed rejects an invalid cursor', async () => {
    await expect(
      service.getMemberActivityFeed('org-1', 'user-1', {
        cursor: '%%%not-base64%%%',
      }),
    ).rejects.toThrow('Invalid cursor');
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('getMemberDashboard serves cache without DB queries', async () => {
    const payload = {
      kpis: {
        totalProjects: 1,
        activeProjects: 1,
        totalMembers: 1,
        openIssues: 0,
        overdueIssues: 0,
      },
      issueStatus: { total: 0, segments: [] },
      activeSprints: [],
      teamWorkload: {
        members: [],
        topBusiest: [],
        capacitySummary: { available: 0, nearCapacity: 0, overloaded: 0 },
      },
      meta: {
        range: '7d' as const,
        generatedAt: new Date().toISOString(),
        variant: 'org_user' as const,
        cacheHit: false,
      },
    };

    (
      service as unknown as { redis: { get: jest.Mock; setex: jest.Mock } }
    ).redis = {
      get: jest.fn().mockResolvedValue(JSON.stringify(payload)),
      setex: jest.fn(),
    };

    const fromCache = await service.getMemberDashboard(
      'org-1',
      'user-1',
      '7d',
    );
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(fromCache.meta.cacheHit).toBe(true);
  });
});
