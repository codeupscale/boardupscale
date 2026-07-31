import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsService } from '../permissions/permissions.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController', () => {
  let controller: DashboardController;
  let dashboardService: {
    getOrgOwnerDashboard: jest.Mock;
    getOrgProjectHealth: jest.Mock;
    getMemberDashboard: jest.Mock;
    getMemberProjectHealth: jest.Mock;
    getMemberScopedProjects: jest.Mock;
    getMemberActivityFeed: jest.Mock;
  };

  beforeEach(async () => {
    dashboardService = {
      getOrgOwnerDashboard: jest.fn().mockResolvedValue({
        kpis: { totalProjects: 1, activeProjects: 1 },
        meta: { variant: 'org_owner' },
      }),
      getOrgProjectHealth: jest.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
        total: 0,
      }),
      getMemberDashboard: jest.fn().mockResolvedValue({
        kpis: { totalProjects: 1, activeProjects: 1 },
        meta: { variant: 'org_user' },
      }),
      getMemberProjectHealth: jest.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
        total: 0,
      }),
      getMemberScopedProjects: jest.fn().mockResolvedValue([
        { id: 'p1', name: 'Website Revamp', key: 'WEB' },
      ]),
      getMemberActivityFeed: jest.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: dashboardService },
        {
          provide: PermissionsService,
          useValue: { checkPermission: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    controller = module.get(DashboardController);
  });

  it('GET /dashboard/organization passes orgId + range to service', async () => {
    const result = await controller.getOrganizationDashboard('org-1', {
      range: '30d',
    });

    expect(dashboardService.getOrgOwnerDashboard).toHaveBeenCalledWith(
      'org-1',
      '30d',
    );
    expect(result).toEqual({
      data: expect.objectContaining({
        kpis: expect.objectContaining({ activeProjects: 1 }),
      }),
    });
  });

  it('GET /dashboard/organization defaults range to 7d', async () => {
    await controller.getOrganizationDashboard('org-1', {});
    expect(dashboardService.getOrgOwnerDashboard).toHaveBeenCalledWith(
      'org-1',
      '7d',
    );
  });

  it('GET /dashboard/organization/project-health passes tenant + paging args', async () => {
    await controller.getOrganizationProjectHealth('org-1', {
      status: 'active',
      cursor: 'abc',
      limit: 10,
    });

    expect(dashboardService.getOrgProjectHealth).toHaveBeenCalledWith('org-1', {
      status: 'active',
      cursor: 'abc',
      limit: 10,
    });
  });

  it('GET /dashboard/member passes orgId + userId + range to service', async () => {
    const result = await controller.getMemberDashboard('org-1', 'user-1', {
      range: '30d',
    });

    expect(dashboardService.getMemberDashboard).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      '30d',
      {
        issueStatusProjectId: undefined,
        activeSprintProjectId: undefined,
        teamWorkloadProjectId: undefined,
      },
    );
    expect(result).toEqual({
      data: expect.objectContaining({
        kpis: expect.objectContaining({ activeProjects: 1 }),
      }),
    });
  });

  it('GET /dashboard/member defaults range to 7d', async () => {
    await controller.getMemberDashboard('org-1', 'user-1', {});
    expect(dashboardService.getMemberDashboard).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      '7d',
      {
        issueStatusProjectId: undefined,
        activeSprintProjectId: undefined,
        teamWorkloadProjectId: undefined,
      },
    );
  });

  it('GET /dashboard/member forwards independent per-widget project filters to service', async () => {
    await controller.getMemberDashboard('org-1', 'user-1', {
      range: '30d',
      issueStatusProjectId: 'proj-1',
      teamWorkloadProjectId: 'proj-2',
    });
    expect(dashboardService.getMemberDashboard).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      '30d',
      {
        issueStatusProjectId: 'proj-1',
        activeSprintProjectId: undefined,
        teamWorkloadProjectId: 'proj-2',
      },
    );
  });

  it('GET /dashboard/member/activity passes tenant + user + paging args', async () => {
    const result = await controller.getMemberActivityFeed('org-1', 'user-1', {
      projectId: 'proj-1',
      cursor: 'abc',
      limit: 10,
    });

    expect(dashboardService.getMemberActivityFeed).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      { projectId: 'proj-1', cursor: 'abc', limit: 10 },
    );
    expect(result).toEqual({ data: { items: [], nextCursor: null } });
  });

  it('GET /dashboard/member/projects passes orgId + userId to service', async () => {
    const result = await controller.getMemberScopedProjects(
      'org-1',
      'user-1',
    );
    expect(dashboardService.getMemberScopedProjects).toHaveBeenCalledWith(
      'org-1',
      'user-1',
    );
    expect(result).toEqual({
      data: [{ id: 'p1', name: 'Website Revamp', key: 'WEB' }],
    });
  });

  it('GET /dashboard/member/project-health passes tenant + user + paging args', async () => {
    await controller.getMemberProjectHealth('org-1', 'user-1', {
      status: 'active',
      cursor: 'abc',
      limit: 10,
    });

    expect(dashboardService.getMemberProjectHealth).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      { status: 'active', cursor: 'abc', limit: 10 },
    );
  });
});
