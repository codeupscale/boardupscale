import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { SearchService } from './search.service';
import { Issue } from '../issues/entities/issue.entity';
import { createMockRepository, createMockQueryBuilder } from '../../test/test-utils';
import { mockIssue, TEST_IDS } from '../../test/mock-factories';

describe('SearchService', () => {
  let service: SearchService;
  let issueRepo: ReturnType<typeof createMockRepository>;
  let mockSearchQueue: { add: jest.Mock };

  beforeEach(async () => {
    issueRepo = createMockRepository();
    mockSearchQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: getRepositoryToken(Issue), useValue: issueRepo },
        { provide: getQueueToken('search-index'), useValue: mockSearchQueue },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              // Return null for ES URL so it falls back to PostgreSQL in tests
              if (key === 'elasticsearch.url') return null;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    // Manually trigger onModuleInit (won't connect to ES since URL is null)
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('search', () => {
    it('should return matching issues by title (PostgreSQL fallback)', async () => {
      const issue = mockIssue({ title: 'Login bug fix' });
      const issues = [issue];
      const qb = createMockQueryBuilder(issues);
      qb.getManyAndCount.mockResolvedValue([issues, 1]);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.search({
        q: 'login',
        organizationId: TEST_IDS.ORG_ID,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(issue.id);
      expect(result.total).toBe(1);
      expect(result.source).toBe('postgresql');
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(issue.title ILIKE :q OR issue.key ILIKE :q OR issue.description ILIKE :q)',
        { q: '%login%' },
      );
    });

    it('should return empty results for empty query', async () => {
      const result = await service.search({
        q: '',
        organizationId: TEST_IDS.ORG_ID,
      });

      expect(result).toEqual({ items: [], total: 0, source: 'postgresql' });
      expect(issueRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should return empty results for whitespace-only query', async () => {
      const result = await service.search({
        q: '   ',
        organizationId: TEST_IDS.ORG_ID,
      });

      expect(result).toEqual({ items: [], total: 0, source: 'postgresql' });
    });

    it('should filter by projectId when provided', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.search({
        q: 'test',
        organizationId: TEST_IDS.ORG_ID,
        projectId: TEST_IDS.PROJECT_ID,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('issue.project_id = :projectId', {
        projectId: TEST_IDS.PROJECT_ID,
      });
    });

    it('should filter by type when provided', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.search({
        q: 'test',
        organizationId: TEST_IDS.ORG_ID,
        type: 'bug',
      });

      expect(qb.andWhere).toHaveBeenCalledWith('issue.type = :type', { type: 'bug' });
    });

    it('should respect custom limit', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.search({
        q: 'test',
        organizationId: TEST_IDS.ORG_ID,
        limit: 5,
      });

      expect(qb.take).toHaveBeenCalledWith(5);
    });

    it('should default limit to 20', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.search({
        q: 'test',
        organizationId: TEST_IDS.ORG_ID,
      });

      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('should scope search to organization', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.search({
        q: 'test',
        organizationId: TEST_IDS.ORG_ID,
      });

      expect(qb.where).toHaveBeenCalledWith('issue.organization_id = :organizationId', {
        organizationId: TEST_IDS.ORG_ID,
      });
    });
  });

  describe('reindexProject', () => {
    it('should enqueue a reindex-project job', async () => {
      await service.reindexProject(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID);

      expect(mockSearchQueue.add).toHaveBeenCalledWith('reindex-project', {
        projectId: TEST_IDS.PROJECT_ID,
        organizationId: TEST_IDS.ORG_ID,
      });
    });
  });
});
