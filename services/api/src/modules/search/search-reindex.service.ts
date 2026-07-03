import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { In, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { Project } from '@/modules/projects/entities/project.entity';
import {
  SearchReindexJob,
  SearchReindexJobStatus,
} from '@/modules/search/entities/search-reindex-job.entity';
import {
  SEARCH_REINDEX_STALLED_PENDING_MS,
  SEARCH_REINDEX_STALLED_PROCESSING_MS,
  searchReindexBullJobId,
} from '@/modules/search/search-reindex.constants';

export type SearchReindexEffectiveStatus = SearchReindexJobStatus | 'stalled';

export interface SearchReindexStatusView {
  id: string;
  organizationId: string;
  projectId: string;
  status: SearchReindexEffectiveStatus;
  dbStatus: SearchReindexJobStatus;
  queueState: string | null;
  stallReason: string | null;
  currentPhase: number;
  currentOffset: number;
  completedPhases: number[];
  totalIssues: number;
  processedIssues: number;
  totalMembers: number;
  processedMembers: number;
  errorLog: string[] | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SearchReindexService {
  private readonly logger = new Logger(SearchReindexService.name);

  constructor(
    @InjectRepository(SearchReindexJob)
    private readonly jobRepository: Repository<SearchReindexJob>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectQueue('search-index')
    private readonly searchIndexQueue: Queue,
  ) {}

  async startReindex(
    projectId: string,
    organizationId: string,
    triggeredById?: string,
  ): Promise<{ jobId: string; projectId: string }> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, organizationId },
      select: ['id', 'organizationId'],
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const active = await this.jobRepository.findOne({
      where: {
        organizationId,
        projectId,
        status: In(['pending', 'processing']),
      },
      select: ['id'],
    });
    if (active) {
      throw new BadRequestException(
        'A search reindex is already in progress for this project',
      );
    }

    const job = await this.jobRepository.save(
      this.jobRepository.create({
        organizationId,
        projectId,
        triggeredById: triggeredById ?? null,
        status: 'pending',
        currentPhase: 0,
        currentOffset: 0,
        completedPhases: [],
      }),
    );

    await this.searchIndexQueue.add(
      'reindex-project',
      { jobId: job.id, projectId, organizationId },
      {
        jobId: searchReindexBullJobId(job.id),
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    );

    this.logger.log(`Enqueued search reindex job ${job.id} for project ${projectId}`);
    return { jobId: job.id, projectId };
  }

  async getStatus(jobId: string, organizationId: string): Promise<SearchReindexStatusView> {
    const job = await this.jobRepository.findOne({
      where: { id: jobId, organizationId },
    });
    if (!job) {
      throw new NotFoundException('Search reindex job not found');
    }
    return this.toStatusView(job);
  }

  async getLatestForProject(
    projectId: string,
    organizationId: string,
  ): Promise<SearchReindexStatusView | null> {
    const job = await this.jobRepository.findOne({
      where: { projectId, organizationId },
      order: { createdAt: 'DESC' },
    });
    return job ? this.toStatusView(job) : null;
  }

  async retry(jobId: string, organizationId: string): Promise<{ jobId: string }> {
    const job = await this.jobRepository.findOne({
      where: { id: jobId, organizationId },
    });
    if (!job) {
      throw new NotFoundException('Search reindex job not found');
    }

    const queueState = await this.resolveQueueState(job.id);
    const { effectiveStatus } = this.computeEffectiveStatus(job, queueState);
    if (
      job.status !== 'failed' &&
      job.status !== 'cancelled' &&
      effectiveStatus !== 'stalled'
    ) {
      throw new BadRequestException('Only failed, cancelled, or stalled reindex jobs can be retried');
    }

    const active = await this.jobRepository.findOne({
      where: {
        organizationId,
        projectId: job.projectId,
        status: In(['pending', 'processing']),
      },
      select: ['id'],
    });
    if (active && active.id !== job.id) {
      throw new BadRequestException(
        'Another reindex is already in progress for this project',
      );
    }

    await this.jobRepository.update(job.id, {
      status: 'pending',
      completedAt: null,
    });

    await this.searchIndexQueue.add(
      'reindex-project',
      { jobId: job.id, projectId: job.projectId, organizationId },
      {
        jobId: `${searchReindexBullJobId(job.id)}-retry-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    );

    return { jobId: job.id };
  }

  async cancel(jobId: string, organizationId: string): Promise<{ jobId: string }> {
    const job = await this.jobRepository.findOne({
      where: { id: jobId, organizationId },
    });
    if (!job) {
      throw new NotFoundException('Search reindex job not found');
    }
    if (job.status !== 'pending' && job.status !== 'processing') {
      throw new BadRequestException('Only active reindex jobs can be cancelled');
    }

    await this.jobRepository.update(job.id, {
      status: 'cancelled',
      completedAt: new Date(),
    });

    try {
      const bullJob = await this.searchIndexQueue.getJob(searchReindexBullJobId(job.id));
      if (bullJob) {
        const state = await bullJob.getState();
        if (state === 'active') {
          this.logger.warn(
            `Reindex job ${job.id} is active — worker will stop at next batch boundary`,
          );
        } else {
          await bullJob.remove();
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not remove BullMQ job for reindex ${job.id}: ${message}`);
    }

    return { jobId: job.id };
  }

  private async toStatusView(job: SearchReindexJob): Promise<SearchReindexStatusView> {
    const queueState = await this.resolveQueueState(job.id);
    const { effectiveStatus, stallReason } = this.computeEffectiveStatus(job, queueState);

    return {
      id: job.id,
      organizationId: job.organizationId,
      projectId: job.projectId,
      status: effectiveStatus,
      dbStatus: job.status,
      queueState,
      stallReason,
      currentPhase: job.currentPhase,
      currentOffset: job.currentOffset,
      completedPhases: job.completedPhases ?? [],
      totalIssues: job.totalIssues,
      processedIssues: job.processedIssues,
      totalMembers: job.totalMembers,
      processedMembers: job.processedMembers,
      errorLog: job.errorLog,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  private computeEffectiveStatus(
    job: SearchReindexJob,
    queueState: string | null,
  ): { effectiveStatus: SearchReindexEffectiveStatus; stallReason: string | null } {
    const now = Date.now();

    // If BullMQ claims the job is already done but DB never transitioned,
    // treat as stalled so the UI can surface recovery (retry/cancel) instead of polling forever.
    if (
      (job.status === 'pending' || job.status === 'processing') &&
      !job.completedAt &&
      queueState === 'completed'
    ) {
      return {
        effectiveStatus: 'stalled',
        stallReason:
          'Queue job completed but the database job record did not update. Ensure the search worker is running the latest code and is connected to the same database.',
      };
    }

    if (job.status === 'pending') {
      const ageMs = now - job.createdAt.getTime();
      if (ageMs > SEARCH_REINDEX_STALLED_PENDING_MS) {
        if (!queueState || queueState === 'missing' || queueState === 'unknown') {
          return {
            effectiveStatus: 'stalled',
            stallReason:
              'Reindex job has been pending for over 2 minutes without starting. Check that the worker is running and Redis is reachable.',
          };
        }
        if (queueState === 'failed') {
          return {
            effectiveStatus: 'stalled',
            stallReason: 'Reindex job failed in the queue before processing started.',
          };
        }
      }
    }

    if (job.status === 'processing') {
      const lastProgress = (job.updatedAt ?? job.startedAt ?? job.createdAt).getTime();
      if (now - lastProgress > SEARCH_REINDEX_STALLED_PROCESSING_MS) {
        return {
          effectiveStatus: 'stalled',
          stallReason:
            'Reindex has had no progress for over 30 minutes. You can cancel and retry.',
        };
      }
    }

    return { effectiveStatus: job.status, stallReason: null };
  }

  private async resolveQueueState(jobId: string): Promise<string | null> {
    try {
      // Prefer the *latest retry attempt* state if one exists, otherwise fall back to the original job id.
      const retryJobs = await this.searchIndexQueue.getJobs([
        'waiting',
        'active',
        'delayed',
        'failed',
        'completed',
      ]);
      const retryMatches = retryJobs
        .filter((j) => String(j.id ?? '').startsWith(`${searchReindexBullJobId(jobId)}-retry-`))
        .sort((a, b) => String(b.id ?? '').localeCompare(String(a.id ?? '')));
      if (retryMatches.length > 0) {
        return retryMatches[0]!.getState();
      }

      const bullJob = await this.searchIndexQueue.getJob(searchReindexBullJobId(jobId));
      if (!bullJob) {
        return 'missing';
      }
      return bullJob.getState();
    } catch {
      return 'unknown';
    }
  }
}
