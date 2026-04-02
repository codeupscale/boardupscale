import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import IORedis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { JiraImportJob, ImportJobStatus } from './entities/jira-import-job.entity';
import { StartApiImportDto } from './dto/jira-connection.dto';

export interface ImportProgressStatus {
  status: ImportJobStatus;
  total: number;
  processed: number;
  failed: number;
  errors: string[];
  startedAt?: string;
  completedAt?: string;
  source: 'file' | 'api';
}

/** Payload enqueued for a live Jira API import job */
export interface JiraApiImportJobPayload {
  jobId: string; // maps to jira_import_jobs.id
  organizationId: string;
  userId: string;
  connectionId: string;
  projectKeys: string[];
  targetProjectId: string | null;
  userMapping: Record<string, string>;
}

@Injectable()
export class JiraImportJobService {
  private readonly logger = new Logger(JiraImportJobService.name);
  private redisClient: IORedis | null = null;

  constructor(
    @InjectRepository(JiraImportJob)
    private jobRepository: Repository<JiraImportJob>,
    @InjectQueue('import')
    private importQueue: Queue,
    private configService: ConfigService,
  ) {
    this.initRedis();
  }

  private initRedis(): void {
    try {
      const redisUrl = this.configService.get<string>('redis.url');
      if (redisUrl) {
        try {
          const url = new URL(redisUrl);
          this.redisClient = new IORedis({
            host: url.hostname,
            port: parseInt(url.port, 10) || 6379,
            password: url.password ? decodeURIComponent(url.password) : undefined,
            maxRetriesPerRequest: 3,
          });
          return;
        } catch {
          // fall through
        }
      }

      this.redisClient = new IORedis({
        host: this.configService.get<string>('redis.host') || 'localhost',
        port: this.configService.get<number>('redis.port') || 6379,
        maxRetriesPerRequest: 3,
      });
    } catch (err: any) {
      this.logger.warn(`Redis init failed (status tracking degraded): ${err.message}`);
    }
  }

  /**
   * Create a DB record for a new API import job, enqueue it, and return the job ID.
   */
  async startApiImport(
    dto: StartApiImportDto,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    // Create durable DB record
    const job = this.jobRepository.create({
      organizationId,
      triggeredById: userId,
      jiraConnectionId: dto.connectionId,
      source: 'api',
      status: 'pending',
      jiraProjectKeys: dto.projectKeys,
      projectId: dto.targetProjectId || null,
    });

    const saved = await this.jobRepository.save(job);
    const jobId = saved.id;

    // Set initial Redis status for real-time polling
    await this.setRedisStatus(jobId, {
      status: 'pending',
      total: 0,
      processed: 0,
      failed: 0,
      errors: [],
      startedAt: new Date().toISOString(),
      source: 'api',
    });

    // Enqueue BullMQ job
    const payload: JiraApiImportJobPayload = {
      jobId,
      organizationId,
      userId,
      connectionId: dto.connectionId,
      projectKeys: dto.projectKeys,
      targetProjectId: dto.targetProjectId || null,
      userMapping: dto.userMapping || {},
    };

    await this.importQueue.add('jira-api-import', payload, {
      jobId: `api-import-${jobId}`,
      attempts: 1,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 86400 },
    });

    this.logger.log(
      `Enqueued jira-api-import job ${jobId} for org ${organizationId} ` +
        `(projects: ${dto.projectKeys.join(', ')})`,
    );

    return jobId;
  }

  /**
   * Get import job status — first from Redis (fast), falls back to DB.
   */
  async getStatus(
    jobId: string,
    organizationId: string,
  ): Promise<ImportProgressStatus> {
    // Try Redis first
    const redisData = await this.getRedisStatus(jobId);
    if (redisData) return redisData;

    // Fallback to DB
    const job = await this.jobRepository.findOne({
      where: { id: jobId, organizationId },
    });

    if (!job) {
      throw new NotFoundException(`Import job ${jobId} not found`);
    }

    return {
      status: job.status,
      total: job.totalIssues,
      processed: job.processedIssues,
      failed: job.failedIssues,
      errors: job.errorLog ?? [],
      startedAt: job.startedAt?.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      source: job.source,
    };
  }

  /**
   * List recent import jobs for an organisation (last 20).
   */
  async listJobs(organizationId: string): Promise<JiraImportJob[]> {
    return this.jobRepository.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: 20,
      relations: ['jiraConnection'],
    });
  }

  /**
   * Called by the worker to update progress.
   * Writes to both Redis (real-time) and DB (durability).
   */
  async updateProgress(
    jobId: string,
    organizationId: string,
    update: Partial<ImportProgressStatus> & { errors?: string[] },
  ): Promise<void> {
    // Update Redis
    const current = (await this.getRedisStatus(jobId)) || {
      status: 'processing' as ImportJobStatus,
      total: 0,
      processed: 0,
      failed: 0,
      errors: [],
      source: 'api' as const,
    };

    const merged: ImportProgressStatus = {
      ...current,
      ...update,
      errors: update.errors
        ? [...(current.errors || []), ...update.errors].slice(-100)
        : current.errors,
    };

    await this.setRedisStatus(jobId, merged);

    // Update DB (throttle to avoid excessive writes — only on status changes or completion)
    const shouldPersist =
      update.status === 'completed' ||
      update.status === 'failed' ||
      update.status === 'processing';

    if (shouldPersist) {
      const dbUpdate: Partial<JiraImportJob> = {
        status: merged.status,
        totalIssues: merged.total,
        processedIssues: merged.processed,
        failedIssues: merged.failed,
      };

      if (merged.errors.length > 0) {
        dbUpdate.errorLog = merged.errors.slice(-100);
      }

      if (update.status === 'processing' && !current.startedAt) {
        dbUpdate.startedAt = new Date();
      }

      if (update.status === 'completed' || update.status === 'failed') {
        dbUpdate.completedAt = new Date();
      }

      await this.jobRepository.update({ id: jobId, organizationId }, dbUpdate);
    }
  }

  /**
   * Called by the worker to link the created project back to the job record.
   */
  async setProjectId(
    jobId: string,
    organizationId: string,
    projectId: string,
  ): Promise<void> {
    await this.jobRepository.update(
      { id: jobId, organizationId },
      { projectId },
    );
  }

  // ─── Redis helpers ─────────────────────────────────────────────────────────

  private async getRedisStatus(
    jobId: string,
  ): Promise<ImportProgressStatus | null> {
    if (!this.redisClient) return null;
    try {
      const raw = await this.redisClient.get(`import:${jobId}`);
      if (!raw) return null;
      return JSON.parse(raw) as ImportProgressStatus;
    } catch {
      return null;
    }
  }

  private async setRedisStatus(
    jobId: string,
    status: ImportProgressStatus,
  ): Promise<void> {
    if (!this.redisClient) return;
    try {
      await this.redisClient.set(
        `import:${jobId}`,
        JSON.stringify(status),
        'EX',
        86400,
      );
    } catch (err: any) {
      this.logger.warn(`Redis status write failed for job ${jobId}: ${err.message}`);
    }
  }
}
