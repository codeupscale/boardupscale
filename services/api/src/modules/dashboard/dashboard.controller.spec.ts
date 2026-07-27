import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsService } from '../permissions/permissions.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController', () => {
  let controller: DashboardController;
  let dashboardService: {
    getOrgOwnerDashboard: jest.Mock;
    getOrgProjectHealth: jest.Mock;
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
});
