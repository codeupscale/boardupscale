import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { ProjectPortabilityJob } from './entities/project-portability-job.entity';
import { ProjectPortabilityExportService } from './project-portability-export.service';
import {
  buildImportPreview,
  isValidProjectBundle,
} from './project-bundle.transformer';
import {
  PortabilityImportOptions,
  PortabilityJobHealth,
  PortabilityJobStatusResponse,
  ProjectBundle,
} from './types/project-bundle.types';
import {
  PreviewPortabilityImportDto,
  StartPortabilityImportDto,
} from './dto/portability.dto';
import { isKanbanProject } from '../projects/project-type';
import { Project } from '../projects/entities/project.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { BundleStatus } from './types/project-bundle.types';

const UPLOAD_DIR = '/tmp/portability-imports';
const PENDING_STALL_MS = 2 * 60 * 1000;
const PROCESSING_STALL_MS = 30 * 60 * 1000;
const BULL_JOB_PREFIX = 'portability';

@Injectable()
export class ProjectPortabilityService {
  private readonly logger = new Logger(ProjectPortabilityService.name);

  constructor(
    @InjectRepository(ProjectPortabilityJob)
    private readonly jobRepository: Repository<ProjectPortabilityJob>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(IssueStatus)
    private readonly statusRepository: Repository<IssueStatus>,
    private readonly exportService: ProjectPortabilityExportService,
    @InjectQueue('project-portability')
    private readonly portabilityQueue: Queue,
  ) {
    this.ensureUploadDir();
  }

  private ensureUploadDir(): void {
    try {
      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to create upload directory: ${message}`);
    }
  }

  private bullJobId(dbJobId: string, retry = false): string {
    return retry ? `${BULL_JOB_PREFIX}-${dbJobId}-retry-${Date.now()}` : `${BULL_JOB_PREFIX}-${dbJobId}`;
  }

  private isBundleAvailable(filePath: string | null | undefined): boolean {
    return !!filePath && filePath.startsWith(UPLOAD_DIR) && fs.existsSync(filePath);
  }

  async exportBundle(projectId: string, organizationId: string): Promise<ProjectBundle> {
    return this.exportService.exportBundle(projectId, organizationId);
  }

  async uploadBundle(
    file: Express.Multer.File,
    organizationId: string,
  ): Promise<{
    filePath: string;
    exportId: string;
    sourceProjectKey: string;
    sourceType: string;
    issueCount: number;
  }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file provided');
    }

    let bundle: unknown;
    try {
      bundle = JSON.parse(file.buffer.toString('utf-8'));
    } catch {
      throw new BadRequestException('Invalid JSON bundle file');
    }

    if (!isValidProjectBundle(bundle)) {
      throw new BadRequestException('Invalid project bundle format');
    }

    if (bundle.manifest.organizationId !== organizationId) {
      throw new BadRequestException(
        'Bundle belongs to a different organization and cannot be imported here',
      );
    }

    const fileId = uuidv4();
    const filePath = path.join(UPLOAD_DIR, `${fileId}.json`);
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(bundle), 'utf-8');
    fs.renameSync(tmpPath, filePath);

    return {
      filePath,
      exportId: bundle.manifest.exportId,
      sourceProjectKey: bundle.manifest.sourceProjectKey,
      sourceType: bundle.manifest.sourceProjectType,
      issueCount: bundle.issues?.length ?? 0,
    };
  }

  private loadBundle(filePath: string, organizationId: string): ProjectBundle {
    if (!filePath?.startsWith(UPLOAD_DIR)) {
      throw new BadRequestException('Invalid bundle file path');
    }
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Bundle file not found or expired');
    }

    let bundle: unknown;
    try {
      bundle = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      throw new BadRequestException('Bundle file is corrupted');
    }

    if (!isValidProjectBundle(bundle)) {
      throw new BadRequestException('Invalid project bundle format');
    }

    if (bundle.manifest.organizationId !== organizationId) {
      throw new BadRequestException('Bundle organization mismatch');
    }

    return bundle;
  }

  private buildOptions(
    dto: PreviewPortabilityImportDto,
    targetType?: string,
  ): PortabilityImportOptions {
    const resolvedType = targetType ?? dto.targetType ?? 'scrum';
    return {
      importComments: dto.importComments !== false,
      importMembers: dto.importMembers !== false,
      importCustomFields: dto.importCustomFields !== false,
      importSprints: dto.importSprints !== false && !isKanbanProject(resolvedType),
      importComponents: dto.importComponents !== false,
      importVersions: dto.importVersions !== false,
      importAttachments: dto.importAttachments !== false,
      importIssueLinks: dto.importIssueLinks !== false,
      importWatchers: dto.importWatchers !== false,
      importWorkLogs: dto.importWorkLogs !== false,
      importProjectSettings: dto.importProjectSettings !== false,
      preserveIssueNumbers: dto.preserveIssueNumbers !== false,
      preserveTimestamps: dto.preserveTimestamps !== false,
      statusMapping: dto.statusMapping ?? undefined,
      mergeIntoExisting: !!dto.targetProjectId,
    };
  }

  private toBundleStatuses(statuses: IssueStatus[]): BundleStatus[] {
    return statuses.map((s, index) => ({
      sourceId: s.id,
      name: s.name ?? '',
      category: (s.category ?? 'todo') as BundleStatus['category'],
      color: s.color ?? '#6B7280',
      position: s.position ?? index,
      isDefault: s.isDefault ?? false,
      wipLimit: s.wipLimit ?? 0,
    }));
  }

  private async resolveImportTarget(
    dto: PreviewPortabilityImportDto,
    organizationId: string,
  ): Promise<{
    mergeIntoExisting: boolean;
    targetProjectId: string | null;
    targetType: string;
    targetProjectKey: string;
    targetProjectName: string;
    targetStatuses: BundleStatus[];
  }> {
    if (dto.targetProjectId) {
      const project = await this.projectRepository.findOne({
        where: { id: dto.targetProjectId, organizationId },
      });
      if (!project) {
        throw new NotFoundException('Target project not found');
      }
      if (project.status === 'archived') {
        throw new BadRequestException('Cannot import into an archived project');
      }

      const existingStatuses = await this.statusRepository.find({
        where: { projectId: project.id },
        order: { position: 'ASC' },
      });

      return {
        mergeIntoExisting: true,
        targetProjectId: project.id,
        targetType: project.type ?? 'scrum',
        targetProjectKey: project.key ?? '',
        targetProjectName: project.name ?? '',
        targetStatuses: this.toBundleStatuses(existingStatuses),
      };
    }

    const targetType = dto.targetType;
    const targetProjectKey = dto.targetProjectKey?.trim().toUpperCase();
    const targetProjectName = dto.targetProjectName?.trim();
    if (!targetType || !targetProjectKey || !targetProjectName) {
      throw new BadRequestException(
        'Target project key, name, and type are required when not importing into an existing project',
      );
    }

    await this.assertTargetKeyAvailable(targetProjectKey, organizationId);

    return {
      mergeIntoExisting: false,
      targetProjectId: null,
      targetType,
      targetProjectKey,
      targetProjectName,
      targetStatuses: [],
    };
  }

  private computePreviewChecksum(
    dto: PreviewPortabilityImportDto,
    bundle: ProjectBundle,
    target: Awaited<ReturnType<ProjectPortabilityService['resolveImportTarget']>>,
  ): string {
    const payload = JSON.stringify({
      exportId: bundle.manifest.exportId,
      targetType: target.targetType,
      targetProjectKey: target.targetProjectKey,
      targetProjectId: target.targetProjectId,
      options: this.buildOptions(dto, target.targetType),
    });
    return createHash('sha256').update(payload).digest('hex').slice(0, 16);
  }

  async previewImport(
    dto: PreviewPortabilityImportDto,
    organizationId: string,
  ): Promise<{ preview: ReturnType<typeof buildImportPreview>; checksum: string }> {
    const bundle = this.loadBundle(dto.filePath, organizationId);
    const target = await this.resolveImportTarget(dto, organizationId);

    if (
      target.mergeIntoExisting &&
      bundle.manifest.sourceProjectId === target.targetProjectId
    ) {
      // Allowed but user should know they're re-importing the same export source
    }

    const options = this.buildOptions(dto, target.targetType);
    const preview = buildImportPreview(
      bundle.manifest.sourceProjectType,
      target.targetType as 'scrum' | 'kanban',
      bundle.manifest.sourceProjectKey,
      target.targetProjectKey,
      target.targetProjectName,
      bundle.statuses ?? [],
      bundle.issues ?? [],
      bundle.sprints?.length ?? 0,
      bundle.comments?.length ?? 0,
      bundle.members?.length ?? 0,
      bundle.customFieldDefinitions?.length ?? 0,
      options,
      target.targetStatuses.length > 0 ? target.targetStatuses : undefined,
    );

    if (
      target.mergeIntoExisting &&
      bundle.manifest.sourceProjectId === target.targetProjectId
    ) {
      preview.warnings.push({
        code: 'SAME_PROJECT_REIMPORT',
        message:
          'This bundle was exported from this project — issues will be duplicated unless the bundle is from a backup.',
      });
    }

    const checksum = this.computePreviewChecksum(dto, bundle, target);
    return { preview, checksum };
  }

  private async assertNoActiveProcessingJob(organizationId: string, excludeJobId?: string): Promise<void> {
    const activeJob = await this.jobRepository.findOne({
      where: { organizationId, status: 'processing' },
    });
    if (activeJob && activeJob.id !== excludeJobId) {
      throw new BadRequestException(
        'Another portability import is already in progress for this organization',
      );
    }
  }

  private async enqueueImportJob(
    job: ProjectPortabilityJob,
    userId: string,
    isRetry = false,
  ): Promise<void> {
    if (!this.isBundleAvailable(job.bundleFilePath)) {
      throw new BadRequestException(
        'Import bundle file is missing or expired — upload the bundle again before retrying',
      );
    }

    await this.portabilityQueue.add(
      'project-import',
      {
        jobId: job.id,
        organizationId: job.organizationId,
        userId,
      },
      {
        jobId: this.bullJobId(job.id, isRetry),
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
      },
    );
  }

  async startImport(
    dto: StartPortabilityImportDto,
    organizationId: string,
    userId: string,
  ): Promise<{ jobId: string }> {
    const bundle = this.loadBundle(dto.filePath, organizationId);
    const target = await this.resolveImportTarget(dto, organizationId);

    const { preview, checksum } = await this.previewImport(dto, organizationId);
    if (dto.previewChecksum && dto.previewChecksum !== checksum) {
      throw new BadRequestException(
        'Import configuration changed since preview — please preview again',
      );
    }

    await this.assertNoActiveProcessingJob(organizationId);

    const options = this.buildOptions(dto, target.targetType);
    const job = this.jobRepository.create({
      organizationId,
      triggeredById: userId,
      sourceProjectId: bundle.manifest.sourceProjectId,
      bundleFilePath: dto.filePath,
      bundleExportId: bundle.manifest.exportId,
      status: 'pending',
      targetType: target.targetType,
      targetProjectKey: target.targetProjectKey.toUpperCase(),
      targetProjectName: target.targetProjectName,
      targetProjectId: target.targetProjectId,
      sourceType: bundle.manifest.sourceProjectType,
      importOptions: options,
      previewResult: preview,
      totalIssues: bundle.issues?.length ?? 0,
      totalComments: options.importComments ? (bundle.comments?.length ?? 0) : 0,
      totalSprints:
        options.importSprints && !isKanbanProject(target.targetType)
          ? (bundle.sprints?.length ?? 0)
          : 0,
      totalAttachments: options.importAttachments ? (bundle.attachments?.length ?? 0) : 0,
    });

    const saved = await this.jobRepository.save(job);
    await this.enqueueImportJob(saved, userId, false);

    return { jobId: saved.id };
  }

  private async findBullJob(dbJobId: string): Promise<Job | undefined> {
    const primary = await this.portabilityQueue.getJob(this.bullJobId(dbJobId));
    if (primary) {
      return primary;
    }
    const jobs = await this.portabilityQueue.getJobs(['waiting', 'active', 'delayed', 'failed']);
    return jobs.find((j) => j.data?.jobId === dbJobId);
  }

  private async buildHealth(job: ProjectPortabilityJob): Promise<PortabilityJobHealth> {
    const now = Date.now();
    const createdMs = job.createdAt ? new Date(job.createdAt).getTime() : now;
    const updatedMs = job.updatedAt ? new Date(job.updatedAt).getTime() : createdMs;
    const startedMs = job.startedAt ? new Date(job.startedAt).getTime() : null;
    const pendingSeconds = Math.max(0, Math.floor((now - createdMs) / 1000));
    const bundleAvailable = this.isBundleAvailable(job.bundleFilePath);

    let bullmqState: string | null = null;
    let queueWaiting = 0;
    let queueActive = 0;

    try {
      [queueWaiting, queueActive] = await Promise.all([
        this.portabilityQueue.getWaitingCount(),
        this.portabilityQueue.getActiveCount(),
      ]);
      const bullJob = await this.findBullJob(job.id);
      bullmqState = bullJob ? await bullJob.getState() : 'missing';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Queue health check failed for job ${job.id}: ${message}`);
      bullmqState = 'unknown';
    }

    let isStalled = false;
    let stallReason: string | null = null;
    let workerHint: string | null = null;

    if (job.status === 'pending') {
      const pendingTooLong = now - createdMs > PENDING_STALL_MS;
      const neverStarted = startedMs == null;
      const queueOrphaned =
        bullmqState === 'missing' || bullmqState === 'failed' || bullmqState === 'unknown';

      if (neverStarted && pendingTooLong && queueOrphaned) {
        isStalled = true;
        stallReason =
          'Import was queued but the worker has not picked it up. The background worker may be offline or connected to a different Redis instance.';
        workerHint = 'Restart the worker service and click Retry, or verify REDIS_URL matches between API and worker.';
      } else if (!bundleAvailable) {
        isStalled = true;
        stallReason = 'Import bundle file is missing or expired on the server.';
        workerHint = 'Upload the bundle again and start a new import.';
      }
    }

    if (job.status === 'processing') {
      const noRecentProgress = now - updatedMs > PROCESSING_STALL_MS;
      if (noRecentProgress) {
        isStalled = true;
        stallReason = 'Import has not reported progress in over 30 minutes — it may have crashed mid-run.';
        workerHint = 'Cancel or retry to resume from the last completed phase.';
      }
    }

    const canRetry =
      (job.status === 'failed' ||
        job.status === 'cancelled' ||
        (isStalled && ['pending', 'processing'].includes(job.status))) &&
      bundleAvailable;

    const canCancel = job.status === 'pending' || job.status === 'processing';

    return {
      bullmqState,
      queueWaiting,
      queueActive,
      isStalled,
      stallReason,
      canRetry,
      canCancel,
      workerHint,
      pendingSeconds,
      bundleAvailable,
    };
  }

  private toStatusResponse(
    job: ProjectPortabilityJob,
    health: PortabilityJobHealth,
  ): PortabilityJobStatusResponse {
    return {
      id: job.id,
      status: job.status,
      currentPhase: job.currentPhase ?? 0,
      totalIssues: job.totalIssues ?? 0,
      processedIssues: job.processedIssues ?? 0,
      failedIssues: job.failedIssues ?? 0,
      totalComments: job.totalComments ?? 0,
      processedComments: job.processedComments ?? 0,
      totalSprints: job.totalSprints ?? 0,
      processedSprints: job.processedSprints ?? 0,
      totalAttachments: job.totalAttachments ?? 0,
      processedAttachments: job.processedAttachments ?? 0,
      targetProjectId: job.targetProjectId ?? null,
      targetProjectKey: job.targetProjectKey,
      targetProjectName: job.targetProjectName,
      targetType: job.targetType as PortabilityJobStatusResponse['targetType'],
      sourceType: (job.sourceType as PortabilityJobStatusResponse['sourceType']) ?? null,
      previewResult: job.previewResult ?? null,
      resultSummary: job.resultSummary ?? null,
      errorLog: job.errorLog ?? null,
      startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : null,
      completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
      createdAt: job.createdAt ? new Date(job.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: job.updatedAt ? new Date(job.updatedAt).toISOString() : new Date().toISOString(),
      ...health,
    };
  }

  async getStatus(jobId: string, organizationId: string): Promise<PortabilityJobStatusResponse> {
    const job = await this.jobRepository.findOne({
      where: { id: jobId, organizationId },
    });
    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    const health = await this.buildHealth(job);

    if (
      health.isStalled &&
      job.status === 'pending' &&
      health.bullmqState === 'missing' &&
      health.pendingSeconds > PENDING_STALL_MS / 1000
    ) {
      await this.jobRepository.update(job.id, {
        errorLog: [health.stallReason ?? 'Import stalled in queue'],
      });
    }

    return this.toStatusResponse(job, health);
  }

  async retry(
    jobId: string,
    organizationId: string,
    userId: string,
  ): Promise<{ jobId: string }> {
    const job = await this.jobRepository.findOne({
      where: { id: jobId, organizationId },
    });
    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    const health = await this.buildHealth(job);
    if (!health.canRetry) {
      throw new BadRequestException(
        health.bundleAvailable
          ? 'This import cannot be retried in its current state'
          : 'Bundle file is missing — upload again and start a new import',
      );
    }

    if (!['failed', 'cancelled', 'pending', 'processing'].includes(job.status)) {
      throw new BadRequestException('Only failed, cancelled, or stalled imports can be retried');
    }

    await this.assertNoActiveProcessingJob(organizationId, job.id);

    try {
      const existing = await this.findBullJob(job.id);
      if (existing) {
        const state = await existing.getState();
        if (state !== 'active') {
          await existing.remove();
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not remove prior BullMQ job for ${job.id}: ${message}`);
    }

    await this.jobRepository.update(job.id, {
      status: 'pending',
      completedAt: null,
      errorLog: null,
    });

    const refreshed = await this.jobRepository.findOne({ where: { id: job.id } });
    if (!refreshed) {
      throw new NotFoundException('Import job not found');
    }

    await this.enqueueImportJob(refreshed, userId, true);
    this.logger.log(`Re-queued portability import ${job.id} (resume from phase ${job.currentPhase})`);

    return { jobId: job.id };
  }

  async cancel(jobId: string, organizationId: string): Promise<{ cancelled: boolean }> {
    const job = await this.getStatus(jobId, organizationId);
    if (!job.canCancel) {
      throw new BadRequestException('Job cannot be cancelled in its current state');
    }

    await this.jobRepository.update(jobId, {
      status: 'cancelled',
      completedAt: new Date(),
    });

    try {
      const bullJob = await this.findBullJob(jobId);
      if (bullJob) {
        const state = await bullJob.getState();
        if (state === 'active') {
          this.logger.warn(
            `Portability job ${jobId} is active — worker will stop at next phase boundary`,
          );
        } else {
          await bullJob.remove();
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to remove BullMQ job for ${jobId}: ${message}`);
    }

    return { cancelled: true };
  }

  async undo(jobId: string, organizationId: string, userId: string): Promise<{ undone: boolean }> {
    const job = await this.jobRepository.findOne({
      where: { id: jobId, organizationId },
    });
    if (!job) {
      throw new NotFoundException('Import job not found');
    }
    if (job.status !== 'completed') {
      throw new BadRequestException('Only completed imports can be undone');
    }
    if (!job.targetProjectId) {
      throw new BadRequestException('No target project to undo');
    }

    await this.portabilityQueue.add(
      'project-undo',
      { jobId: job.id, organizationId, userId },
      { jobId: `portability-undo-${job.id}-${Date.now()}`, attempts: 2 },
    );

    return { undone: true };
  }

  async getHistory(
    organizationId: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: PortabilityJobStatusResponse[]; total: number; page: number; limit: number }> {
    const safeLimit = Math.min(50, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const [items, total] = await this.jobRepository.findAndCount({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    const enriched = await Promise.all(
      items.map(async (job) => this.toStatusResponse(job, await this.buildHealth(job))),
    );

    return { items: enriched, total, page: safePage, limit: safeLimit };
  }

  private async assertTargetKeyAvailable(key: string, organizationId: string): Promise<void> {
    const normalized = key.trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException('Target project key is required');
    }
    const existing = await this.projectRepository.findOne({
      where: { key: normalized, organizationId },
    });
    if (existing) {
      throw new BadRequestException(`Project key "${normalized}" is already in use`);
    }
  }
}
