import { Test, TestingModule } from '@nestjs/testing';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { DataSource } from 'typeorm';
import { PermissionsService } from '../permissions/permissions.service';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';
import { ResolveProjectBodyInterceptor } from '../../common/interceptors/resolve-project-body.interceptor';
import { REQUEST } from '@nestjs/core';
import { mockIssue, mockWorkLog, TEST_IDS } from '../../test/mock-factories';

describe('IssuesController', () => {
  let controller: IssuesController;
  let issuesService: Record<string, jest.Mock>;

  beforeEach(async () => {
    issuesService = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      addWatcher: jest.fn(),
      toggleWatch: jest.fn(),
      getWatchers: jest.fn(),
      createLink: jest.fn(),
      getLinks: jest.fn(),
      deleteLink: jest.fn(),
      getChildren: jest.fn(),
      createWorkLog: jest.fn(),
      getWorkLogs: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IssuesController],
      providers: [
        { provide: IssuesService, useValue: issuesService },
        { provide: PermissionsService, useValue: { checkPermission: jest.fn().mockResolvedValue(true) } },
        { provide: DataSource, useValue: { getRepository: jest.fn() } },
        { provide: ResolveProjectPipe, useValue: { transform: jest.fn((v) => v) } },
        { provide: ResolveProjectBodyInterceptor, useValue: { intercept: jest.fn((_, next) => next.handle()) } },
        { provide: REQUEST, useValue: { user: { organizationId: TEST_IDS.ORG_ID } } },
      ],
    }).compile();

    controller = await module.resolve<IssuesController>(IssuesController);
  });

  describe('GET /issues', () => {
    it('should return paginated issues with meta', async () => {
      const issues = [mockIssue()];
      issuesService.findAll.mockResolvedValue({ items: issues, total: 1, page: 1, limit: 20 });

      const result = await controller.findAll(
        TEST_IDS.ORG_ID,
        { page: 1, limit: 20 } as any,
        TEST_IDS.PROJECT_ID,
      );

      expect(result).toEqual({
        data: issues,
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });
    });

    it('should calculate totalPages correctly', async () => {
      issuesService.findAll.mockResolvedValue({ items: [], total: 55, page: 1, limit: 10 });

      const result = await controller.findAll(TEST_IDS.ORG_ID, { page: 1, limit: 10 } as any);

      expect(result.meta.totalPages).toBe(6); // ceil(55/10)
    });
  });

  describe('POST /issues', () => {
    it('should create a new issue', async () => {
      const issue = mockIssue();
      issuesService.create.mockResolvedValue(issue);
      const dto = { projectId: TEST_IDS.PROJECT_ID, title: 'Test Issue' };
      const user = { id: TEST_IDS.USER_ID };

      const result = await controller.create(dto as any, TEST_IDS.ORG_ID, user);

      expect(result).toEqual(issue);
      expect(issuesService.create).toHaveBeenCalledWith(dto, TEST_IDS.ORG_ID, TEST_IDS.USER_ID);
    });
  });

  describe('GET /issues/:id', () => {
    it('should return a single issue', async () => {
      const issue = mockIssue();
      issuesService.findById.mockResolvedValue(issue);

      const result = await controller.findOne(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID);

      expect(result).toEqual(issue);
    });
  });

  describe('PATCH /issues/:id', () => {
    it('should update an issue', async () => {
      const updated = mockIssue({ title: 'Updated' });
      issuesService.update.mockResolvedValue(updated);
      const user = { id: TEST_IDS.USER_ID };

      const result = await controller.update(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID, user, { title: 'Updated' });

      expect(result).toEqual(updated);
      expect(issuesService.update).toHaveBeenCalledWith(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID, { title: 'Updated' }, TEST_IDS.USER_ID);
    });
  });

  describe('DELETE /issues/:id', () => {
    it('should soft delete an issue', async () => {
      issuesService.softDelete.mockResolvedValue(undefined);

      await controller.delete(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID);

      expect(issuesService.softDelete).toHaveBeenCalledWith(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID);
    });
  });

  describe('POST /issues/:id/watch', () => {
    it('should toggle watch on an issue', async () => {
      const watchResult = { watching: true, watcherCount: 1 };
      issuesService.toggleWatch.mockResolvedValue(watchResult);
      const user = { id: TEST_IDS.USER_ID };

      const result = await controller.toggleWatch(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID, user);

      expect(result).toEqual(watchResult);
    });
  });

  describe('GET /issues/:id/children', () => {
    it('should return children issues', async () => {
      const children = [mockIssue({ id: 'child-1', parentId: TEST_IDS.ISSUE_ID })];
      issuesService.getChildren.mockResolvedValue(children);

      const result = await controller.getChildren(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID);

      expect(result).toEqual({ data: children });
    });
  });

  describe('POST /issues/:id/work-log', () => {
    it('should create a work log', async () => {
      const workLog = mockWorkLog();
      issuesService.createWorkLog.mockResolvedValue(workLog);
      const user = { id: TEST_IDS.USER_ID };
      const dto = { timeSpent: 3600, description: 'Worked on it' };

      const result = await controller.createWorkLog(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID, user, dto as any);

      expect(result).toEqual(workLog);
    });
  });

  describe('GET /issues/:id/work-logs', () => {
    it('should return work logs', async () => {
      const logs = [mockWorkLog()];
      issuesService.getWorkLogs.mockResolvedValue(logs);

      const result = await controller.getWorkLogs(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID);

      expect(result).toEqual({ data: logs });
    });
  });
});
