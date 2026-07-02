import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SearchReindexService } from '@/modules/search/search-reindex.service';
import { SearchReindexJob } from '@/modules/search/entities/search-reindex-job.entity';
import { Project } from '@/modules/projects/entities/project.entity';
import { createMockRepository } from '@/test/test-utils';
import { TEST_IDS } from '@/test/mock-factories';
import { searchReindexBullJobId } from '@/modules/search/search-reindex.constants';

describe('SearchReindexService', () => {
  let service: SearchReindexService;
  let jobRepo: ReturnType<typeof createMockRepository>;
  let projectRepo: ReturnType<typeof createMockRepository>;
  let mockQueue: { add: jest.Mock; getJob: jest.Mock; getJobs: jest.Mock };

  beforeEach(async () => {
    jobRepo = createMockRepository();
    projectRepo = createMockRepository();
    mockQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn().mockResolvedValue(null),
      getJobs: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchReindexService,
        { provide: getRepositoryToken(SearchReindexJob), useValue: jobRepo },
        { provide: getRepositoryToken(Project), useValue: projectRepo },
        { provide: getQueueToken('search-index'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get(SearchReindexService);
  });

  describe('startReindex', () => {
    it('creates DB job and enqueues BullMQ work', async () => {
      projectRepo.findOne.mockResolvedValue({ id: TEST_IDS.PROJECT_ID });
      jobRepo.findOne.mockResolvedValue(null);
      jobRepo.create.mockImplementation((row) => row);
      jobRepo.save.mockResolvedValue({
        id: TEST_IDS.ISSUE_ID,
        organizationId: TEST_IDS.ORG_ID,
        projectId: TEST_IDS.PROJECT_ID,
      });

      const result = await service.startReindex(
        TEST_IDS.PROJECT_ID,
        TEST_IDS.ORG_ID,
        TEST_IDS.USER_ID,
      );

      expect(result.jobId).toBe(TEST_IDS.ISSUE_ID);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'reindex-project',
        {
          jobId: TEST_IDS.ISSUE_ID,
          projectId: TEST_IDS.PROJECT_ID,
          organizationId: TEST_IDS.ORG_ID,
        },
        expect.objectContaining({ jobId: searchReindexBullJobId(TEST_IDS.ISSUE_ID) }),
      );
    });

    it('rejects when project missing', async () => {
      projectRepo.findOne.mockResolvedValue(null);
      await expect(
        service.startReindex(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects duplicate active job for same project', async () => {
      projectRepo.findOne.mockResolvedValue({ id: TEST_IDS.PROJECT_ID });
      jobRepo.findOne.mockResolvedValue({ id: 'active-job' });

      await expect(
        service.startReindex(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('retry', () => {
    it('re-enqueues failed jobs preserving resume state', async () => {
      jobRepo.findOne
        .mockResolvedValueOnce({
          id: TEST_IDS.ISSUE_ID,
          organizationId: TEST_IDS.ORG_ID,
          projectId: TEST_IDS.PROJECT_ID,
          status: 'failed',
          completedPhases: [1],
          currentOffset: 200,
        })
        .mockResolvedValueOnce(null);

      const result = await service.retry(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID);

      expect(result.jobId).toBe(TEST_IDS.ISSUE_ID);
      expect(jobRepo.update).toHaveBeenCalledWith(TEST_IDS.ISSUE_ID, {
        status: 'pending',
        completedAt: null,
      });
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('re-enqueues stalled active jobs', async () => {
      const createdAt = new Date(Date.now() - 30_000);
      jobRepo.findOne
        .mockResolvedValueOnce({
          id: TEST_IDS.ISSUE_ID,
          organizationId: TEST_IDS.ORG_ID,
          projectId: TEST_IDS.PROJECT_ID,
          status: 'pending',
          completedAt: null,
          createdAt,
          updatedAt: createdAt,
        })
        .mockResolvedValueOnce({
          id: TEST_IDS.ISSUE_ID,
          organizationId: TEST_IDS.ORG_ID,
          projectId: TEST_IDS.PROJECT_ID,
          status: 'pending',
        });
      mockQueue.getJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue('completed'),
      });

      const result = await service.retry(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID);

      expect(result.jobId).toBe(TEST_IDS.ISSUE_ID);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'reindex-project',
        {
          jobId: TEST_IDS.ISSUE_ID,
          projectId: TEST_IDS.PROJECT_ID,
          organizationId: TEST_IDS.ORG_ID,
        },
        expect.objectContaining({
          jobId: expect.stringContaining(`${searchReindexBullJobId(TEST_IDS.ISSUE_ID)}-retry-`),
        }),
      );
    });
  });

  describe('cancel', () => {
    it('marks DB cancelled and removes waiting queue job', async () => {
      jobRepo.findOne.mockResolvedValue({
        id: TEST_IDS.ISSUE_ID,
        status: 'pending',
      });
      mockQueue.getJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue('waiting'),
        remove: jest.fn().mockResolvedValue(undefined),
      });

      await service.cancel(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID);

      expect(jobRepo.update).toHaveBeenCalledWith(TEST_IDS.ISSUE_ID, {
        status: 'cancelled',
        completedAt: expect.any(Date),
      });
    });
  });
});
