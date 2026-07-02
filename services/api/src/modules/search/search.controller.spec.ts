import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { SearchController } from '@/modules/search/search.controller';
import { SearchService } from '@/modules/search/search.service';
import { SearchReindexService } from '@/modules/search/search-reindex.service';
import { PermissionsService } from '@/modules/permissions/permissions.service';
import { ResolveProjectPipe } from '@/common/pipes/resolve-project.pipe';
import { TEST_IDS } from '@/test/mock-factories';

describe('SearchController', () => {
  let controller: SearchController;
  let searchService: {
    search: jest.Mock;
    findSimilar: jest.Mock;
  };
  let searchReindexService: {
    startReindex: jest.Mock;
  };

  const searchResult = {
    issues: [{ kind: 'issue' as const, id: TEST_IDS.ISSUE_ID, key: 'TEST-1', title: 'Login bug' }],
    projects: [],
    members: [],
    totals: { issues: 1, projects: 0, members: 0 },
    source: 'postgresql' as const,
  };

  beforeEach(async () => {
    searchService = {
      search: jest.fn().mockResolvedValue(searchResult),
      findSimilar: jest.fn().mockResolvedValue({ items: [], total: 0, source: 'postgresql' }),
    };
    searchReindexService = {
      startReindex: jest.fn().mockResolvedValue({
        jobId: TEST_IDS.ISSUE_ID,
        projectId: TEST_IDS.PROJECT_ID,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SearchService, useValue: searchService },
        { provide: SearchReindexService, useValue: searchReindexService },
        { provide: PermissionsService, useValue: { checkPermission: jest.fn().mockResolvedValue(true) } },
        { provide: DataSource, useValue: { getRepository: jest.fn() } },
        { provide: ResolveProjectPipe, useValue: { transform: jest.fn((v) => v) } },
        { provide: REQUEST, useValue: { user: { organizationId: TEST_IDS.ORG_ID } } },
      ],
    }).compile();

    controller = await module.resolve<SearchController>(SearchController);
  });

  describe('GET /search', () => {
    it('passes tenant and RBAC context to the service', async () => {
      const user = {
        id: TEST_IDS.USER_ID,
        organizationId: TEST_IDS.ORG_ID,
        role: 'user',
      };

      const result = await controller.search(
        TEST_IDS.ORG_ID,
        user,
        { q: 'login', limit: 10 },
        TEST_IDS.PROJECT_ID,
      );

      expect(searchService.search).toHaveBeenCalledWith({
        q: 'login',
        organizationId: TEST_IDS.ORG_ID,
        userId: TEST_IDS.USER_ID,
        orgRole: 'user',
        projectId: TEST_IDS.PROJECT_ID,
        type: undefined,
        priority: undefined,
        statusName: undefined,
        limit: 10,
      });
      expect(result.meta.source).toBe('postgresql');
    });

    it('propagates ForbiddenException from service (project scope bypass)', async () => {
      searchService.search.mockRejectedValue(new ForbiddenException('Project not accessible'));

      await expect(
        controller.search(
          TEST_IDS.ORG_ID,
          { id: TEST_IDS.USER_ID, role: 'user' },
          { q: 'test' },
          '99999999-9999-9999-9999-999999999999',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST /search/reindex/:projectId', () => {
    it('delegates reindex to SearchReindexService and returns jobId', async () => {
      const result = await controller.reindexProject(
        TEST_IDS.ORG_ID,
        TEST_IDS.USER_ID,
        TEST_IDS.PROJECT_ID,
      );

      expect(searchReindexService.startReindex).toHaveBeenCalledWith(
        TEST_IDS.PROJECT_ID,
        TEST_IDS.ORG_ID,
        TEST_IDS.USER_ID,
      );
      expect(result.data.jobId).toBe(TEST_IDS.ISSUE_ID);
    });
  });
});
