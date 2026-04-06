import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, BadRequestException } from '@nestjs/common';

import { MigrationService } from './migration.service';
import { JiraMigrationRun } from './entities/jira-migration-run.entity';
import { JiraConnection } from '../import/entities/jira-connection.entity';
import { JiraApiService } from '../import/jira-api.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<JiraMigrationRun> = {}): JiraMigrationRun {
  return {
    id: 'run-uuid-1',
    organizationId: 'org-1',
    triggeredById: 'user-1',
    connectionId: 'conn-1',
    status: 'pending',
    currentPhase: 0,
    currentOffset: 0,
    selectedProjects: null,
    statusMapping: null,
    roleMapping: null,
    options: null,
    totalProjects: 0,
    processedProjects: 0,
    totalIssues: 0,
    processedIssues: 0,
    failedIssues: 0,
    totalMembers: 0,
    processedMembers: 0,
    totalSprints: 0,
    processedSprints: 0,
    totalComments: 0,
    processedComments: 0,
    resultSummary: null,
    errorLog: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    organization: undefined as any,
    triggeredBy: undefined as any,
    connection: null,
    ...overrides,
  } as JiraMigrationRun;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MigrationService', () => {
  let service: MigrationService;
  let runRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; update: jest.Mock; findAndCount: jest.Mock };
  let connRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; update: jest.Mock };
  let jiraApi: { testConnection: jest.Mock; listProjects: jest.Mock; fetchOrgUsers: jest.Mock; fetchIssuesByJql: jest.Mock };
  let queue: { add: jest.Mock; getJob: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    runRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findAndCount: jest.fn(),
    };

    connRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    jiraApi = {
      testConnection: jest.fn(),
      listProjects: jest.fn(),
      fetchOrgUsers: jest.fn(),
      fetchIssuesByJql: jest.fn(),
    };

    queue = { add: jest.fn(), getJob: jest.fn() };

    configService = {
      get: jest.fn().mockReturnValue('test-secret-32-chars-long-padded'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MigrationService,
        { provide: getRepositoryToken(JiraMigrationRun), useValue: runRepo },
        { provide: getRepositoryToken(JiraConnection), useValue: connRepo },
        { provide: JiraApiService, useValue: jiraApi },
        { provide: ConfigService, useValue: configService },
        { provide: getQueueToken('jira-migration'), useValue: queue },
      ],
    }).compile();

    service = module.get<MigrationService>(MigrationService);
  });

  // ── connect ─────────────────────────────────────────────────────────────────

  describe('connect', () => {
    it('throws BadRequestException when Jira credentials are invalid', async () => {
      jiraApi.testConnection.mockResolvedValue({ ok: false, errorMessage: 'Invalid credentials' });

      await expect(
        service.connect(
          { url: 'https://test.atlassian.net', email: 'u@t.com', apiToken: 'bad', type: 'cloud' },
          'org-1',
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns runId and project list on success', async () => {
      jiraApi.testConnection.mockResolvedValue({ ok: true, displayName: 'Alice' });
      jiraApi.listProjects.mockResolvedValue([
        { id: '1', key: 'PROJ', name: 'Project One' },
      ]);
      jiraApi.fetchOrgUsers.mockResolvedValue([{ accountId: 'a1', emailAddress: 'a@b.com' }]);
      connRepo.update.mockResolvedValue(undefined);
      connRepo.create.mockReturnValue({ id: 'conn-1', jiraUrl: 'https://test.atlassian.net', jiraEmail: 'u@t.com', apiTokenEnc: 'enc', isActive: true, lastTestedAt: new Date(), lastTestOk: true });
      connRepo.save.mockResolvedValue({ id: 'conn-1' });
      runRepo.create.mockReturnValue(makeRun());
      runRepo.save.mockResolvedValue(makeRun({ id: 'run-1' }));

      const result = await service.connect(
        { url: 'https://test.atlassian.net', email: 'u@t.com', apiToken: 'valid-token', type: 'cloud' },
        'org-1',
        'user-1',
      );

      expect(result.runId).toBe('run-1');
      expect(result.projectCount).toBe(1);
      expect(result.memberCount).toBe(1);
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].key).toBe('PROJ');
    });

    it('still succeeds when fetchOrgUsers throws (non-fatal)', async () => {
      jiraApi.testConnection.mockResolvedValue({ ok: true, displayName: 'Alice' });
      jiraApi.listProjects.mockResolvedValue([]);
      jiraApi.fetchOrgUsers.mockRejectedValue(new Error('Permission denied'));
      connRepo.update.mockResolvedValue(undefined);
      connRepo.create.mockReturnValue({});
      connRepo.save.mockResolvedValue({ id: 'conn-1' });
      runRepo.create.mockReturnValue(makeRun());
      runRepo.save.mockResolvedValue(makeRun({ id: 'run-2' }));

      const result = await service.connect(
        { url: 'https://test.atlassian.net', email: 'u@t.com', apiToken: 'valid', type: 'cloud' },
        'org-1',
        'user-1',
      );

      expect(result.memberCount).toBe(0);
    });
  });

  // ── start ────────────────────────────────────────────────────────────────────

  describe('start', () => {
    it('throws NotFoundException when run does not belong to org', async () => {
      runRepo.findOne.mockResolvedValue(null);

      await expect(
        service.start(
          { runId: 'non-existent', projectKeys: ['PROJ'] },
          'org-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when run is already processing', async () => {
      runRepo.findOne.mockResolvedValue(makeRun({ status: 'processing' }));

      await expect(
        service.start({ runId: 'run-1', projectKeys: ['PROJ'] }, 'org-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('enqueues a BullMQ job and returns runId', async () => {
      const run = makeRun({ id: 'run-1', status: 'pending' });
      runRepo.findOne.mockResolvedValue(run);
      runRepo.update.mockResolvedValue(undefined);
      queue.add.mockResolvedValue({ id: 'job-1' });

      const result = await service.start(
        { runId: 'run-1', projectKeys: ['PROJ', 'BACK'] },
        'org-1',
      );

      expect(result.runId).toBe('run-1');
      expect(queue.add).toHaveBeenCalledWith(
        'jira-migration',
        expect.objectContaining({ runId: 'run-1', organizationId: 'org-1' }),
        expect.objectContaining({ jobId: 'migration-run-1' }),
      );
    });
  });

  // ── getStatus ────────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns the run record', async () => {
      const run = makeRun({ id: 'run-1', status: 'processing' });
      runRepo.findOne.mockResolvedValue(run);

      const result = await service.getStatus('run-1', 'org-1');
      expect(result.status).toBe('processing');
    });

    it('throws NotFoundException for missing run', async () => {
      runRepo.findOne.mockResolvedValue(null);
      await expect(service.getStatus('bad', 'org-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── retry ─────────────────────────────────────────────────────────────────

  describe('retry', () => {
    it('throws BadRequestException for non-failed run', async () => {
      runRepo.findOne.mockResolvedValue(makeRun({ status: 'processing' }));
      await expect(service.retry('run-1', 'org-1')).rejects.toThrow(BadRequestException);
    });

    it('re-enqueues a failed run', async () => {
      const run = makeRun({ id: 'run-1', status: 'failed' });
      runRepo.findOne.mockResolvedValue(run);
      runRepo.update.mockResolvedValue(undefined);
      queue.add.mockResolvedValue({ id: 'job-2' });

      const result = await service.retry('run-1', 'org-1');
      expect(result.runId).toBe('run-1');
      expect(queue.add).toHaveBeenCalled();
    });
  });

  // ── getHistory ────────────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('returns paginated list scoped to org', async () => {
      const run = makeRun();
      runRepo.findAndCount.mockResolvedValue([[run], 1]);

      const result = await service.getHistory('org-1', 1, 10);
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(runRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });
  });

  // ── cancel ────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('throws NotFoundException when run does not exist', async () => {
      runRepo.findOne.mockResolvedValue(null);

      await expect(service.cancel('bad-run', 'org-1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when run is already completed', async () => {
      runRepo.findOne.mockResolvedValue(makeRun({ status: 'completed' }));

      await expect(service.cancel('run-1', 'org-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when run is already cancelled', async () => {
      runRepo.findOne.mockResolvedValue(makeRun({ status: 'cancelled' }));

      await expect(service.cancel('run-1', 'org-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when run is failed', async () => {
      runRepo.findOne.mockResolvedValue(makeRun({ status: 'failed' }));

      await expect(service.cancel('run-1', 'org-1')).rejects.toThrow(BadRequestException);
    });

    it('cancels a pending run — marks DB as cancelled and removes waiting BullMQ job', async () => {
      const run = makeRun({ id: 'run-1', status: 'pending' });
      runRepo.findOne.mockResolvedValue(run);
      runRepo.update.mockResolvedValue(undefined);

      const mockJob = { getState: jest.fn().mockResolvedValue('waiting'), remove: jest.fn().mockResolvedValue(undefined) };
      queue.getJob.mockResolvedValue(mockJob);

      const result = await service.cancel('run-1', 'org-1');

      expect(result.runId).toBe('run-1');
      expect(runRepo.update).toHaveBeenCalledWith('run-1', { status: 'cancelled' });
      expect(queue.getJob).toHaveBeenCalledWith('migration-run-1');
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('cancels a processing run — marks DB as cancelled and warns about active job', async () => {
      const run = makeRun({ id: 'run-2', status: 'processing' });
      runRepo.findOne.mockResolvedValue(run);
      runRepo.update.mockResolvedValue(undefined);

      // Active jobs cannot be removed; service should NOT call job.remove()
      const mockJob = { getState: jest.fn().mockResolvedValue('active'), remove: jest.fn() };
      queue.getJob.mockResolvedValue(mockJob);

      const result = await service.cancel('run-2', 'org-1');

      expect(result.runId).toBe('run-2');
      expect(runRepo.update).toHaveBeenCalledWith('run-2', { status: 'cancelled' });
      // DB status is the real cancel signal for active jobs — remove must NOT be called
      expect(mockJob.remove).not.toHaveBeenCalled();
    });

    it('cancels gracefully when BullMQ job is not found (already completed)', async () => {
      const run = makeRun({ id: 'run-3', status: 'pending' });
      runRepo.findOne.mockResolvedValue(run);
      runRepo.update.mockResolvedValue(undefined);
      queue.getJob.mockResolvedValue(null); // job already gone

      const result = await service.cancel('run-3', 'org-1');

      expect(result.runId).toBe('run-3');
      expect(runRepo.update).toHaveBeenCalledWith('run-3', { status: 'cancelled' });
    });

    it('cancels gracefully even when getJob throws (non-fatal queue error)', async () => {
      const run = makeRun({ id: 'run-4', status: 'pending' });
      runRepo.findOne.mockResolvedValue(run);
      runRepo.update.mockResolvedValue(undefined);
      queue.getJob.mockRejectedValue(new Error('Redis connection error'));

      // Should not throw — queue errors are non-fatal
      const result = await service.cancel('run-4', 'org-1');

      expect(result.runId).toBe('run-4');
      // DB cancel must still have been written despite the queue error
      expect(runRepo.update).toHaveBeenCalledWith('run-4', { status: 'cancelled' });
    });

    it('does not cancel a run belonging to a different org', async () => {
      // findOne scopes by (id, organizationId) — returns null for wrong org
      runRepo.findOne.mockResolvedValue(null);

      await expect(service.cancel('run-1', 'other-org')).rejects.toThrow(NotFoundException);
      expect(runRepo.update).not.toHaveBeenCalled();
    });
  });
});
