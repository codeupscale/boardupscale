import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';

import { JiraMigrationRun } from './entities/jira-migration-run.entity';
import { JiraConnection } from '../import/entities/jira-connection.entity';
import { JiraApiService } from '../import/jira-api.service';
import { encrypt } from '../import/crypto.util';

import { ConnectJiraDto } from './dto/connect-jira.dto';
import { StartMigrationDto, PreviewMigrationDto } from './dto/start-migration.dto';

export interface ConnectResult {
  runId: string;
  displayName: string;
  orgName: string;
  projectCount: number;
  memberCount: number;
  projects: Array<{ key: string; name: string; description?: string }>;
}

export interface PreviewResult {
  projects: Array<{
    key: string;
    name: string;
    issueCount: number;
    sprintCount: number;
  }>;
  totalIssues: number;
  totalSprints: number;
  totalMembers: number;
  estimatedMinutes: number;
}

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  constructor(
    @InjectRepository(JiraMigrationRun)
    private runRepository: Repository<JiraMigrationRun>,

    @InjectRepository(JiraConnection)
    private connectionRepository: Repository<JiraConnection>,

    private jiraApiService: JiraApiService,
    private configService: ConfigService,

    @InjectQueue('jira-migration')
    private migrationQueue: Queue,
  ) {}

  private get appSecret(): string {
    const s = this.configService.get<string>('app.secret');
    if (!s) throw new Error('APP_SECRET not configured');
    return s;
  }

  // ── 1. Connect & test credentials ─────────────────────────────────────────

  async connect(
    dto: ConnectJiraDto,
    organizationId: string,
    userId: string,
  ): Promise<ConnectResult> {
    const baseUrl = dto.url.replace(/\/$/, '');
    const credentials = { baseUrl, email: dto.email, apiToken: dto.apiToken };

    const testResult = await this.jiraApiService.testConnection(credentials);
    if (!testResult.ok) {
      throw new BadRequestException(
        `Jira connection failed: ${testResult.errorMessage || 'invalid credentials'}`,
      );
    }

    // Fetch projects list
    const projects = await this.jiraApiService.listProjects(credentials);

    // Fetch member count (best-effort — some orgs restrict this endpoint)
    let memberCount = 0;
    try {
      const members = await this.jiraApiService.fetchOrgUsers(credentials);
      memberCount = members.length;
    } catch {
      // non-fatal
    }

    // Encrypt the token and upsert the JiraConnection row
    const tokenEnc = encrypt(dto.apiToken, this.appSecret);
    await this.connectionRepository.update({ organizationId }, { isActive: false });
    const connection = this.connectionRepository.create({
      organizationId,
      createdById: userId,
      jiraUrl: baseUrl,
      jiraEmail: dto.email.trim().toLowerCase(),
      apiTokenEnc: tokenEnc,
      isActive: true,
      lastTestedAt: new Date(),
      lastTestOk: true,
    });
    const savedConn = await this.connectionRepository.save(connection);

    // Create a pending MigrationRun record
    const run = this.runRepository.create({
      organizationId,
      triggeredById: userId,
      connectionId: savedConn.id,
      status: 'pending',
      currentPhase: 0,
    });
    const savedRun = await this.runRepository.save(run);

    this.logger.log(
      `Created migration run ${savedRun.id} for org ${organizationId} — ${projects.length} projects available`,
    );

    return {
      runId: savedRun.id,
      displayName: testResult.displayName ?? dto.email,
      orgName: this.extractOrgName(baseUrl),
      projectCount: projects.length,
      memberCount,
      projects: projects.map((p) => ({
        key: p.key,
        name: p.name,
        description: p.description,
      })),
    };
  }

  // ── 2. Preview selected projects ──────────────────────────────────────────

  async preview(
    dto: PreviewMigrationDto,
    organizationId: string,
  ): Promise<PreviewResult> {
    const run = await this.findRun(dto.runId, organizationId);
    const credentials = await this.getCredentials(run);

    const results: PreviewResult['projects'] = [];
    let totalIssues = 0;
    let totalSprints = 0;

    for (const key of dto.projectKeys) {
      // Issue count via JQL
      let issueCount = 0;
      try {
        const page = await this.jiraApiService.fetchIssuesByJql(
          credentials,
          `project = "${key}" ORDER BY created ASC`,
        );
        issueCount = page.length;
        totalIssues += issueCount;
      } catch {
        // keep 0
      }

      // Sprint count via Agile API
      let sprintCount = 0;
      try {
        const boardsResp = await (this.jiraApiService as any).get(
          credentials,
          `/rest/agile/1.0/board?projectKeyOrId=${key}`,
        ).catch(() => ({ values: [] }));
        const boardId = boardsResp?.values?.[0]?.id;
        if (boardId) {
          const sprintsResp = await (this.jiraApiService as any).get(
            credentials,
            `/rest/agile/1.0/board/${boardId}/sprint`,
          ).catch(() => ({ values: [] }));
          sprintCount = Array.isArray(sprintsResp?.values) ? sprintsResp.values.length : 0;
        }
        totalSprints += sprintCount;
      } catch {
        // keep 0
      }

      results.push({ key, name: key, issueCount, sprintCount });
    }

    // Rough estimate: 100 issues/min
    const estimatedMinutes = Math.max(1, Math.ceil(totalIssues / 100));

    // Fetch member count
    let memberCount = 0;
    try {
      const members = await this.jiraApiService.fetchOrgUsers(credentials);
      memberCount = members.length;
    } catch {
      // non-fatal
    }

    return {
      projects: results,
      totalIssues,
      totalSprints,
      totalMembers: memberCount,
      estimatedMinutes,
    };
  }

  // ── 3. Start migration ────────────────────────────────────────────────────

  async start(
    dto: StartMigrationDto,
    organizationId: string,
  ): Promise<{ runId: string }> {
    const run = await this.findRun(dto.runId, organizationId);

    if (run.status === 'processing') {
      throw new BadRequestException('Migration is already in progress');
    }

    // Populate the run with selected projects and config
    const selectedProjects = dto.projectKeys.map((key) => ({
      key,
      name: key,
      issueCount: 0,
    }));

    await this.runRepository.update(run.id, {
      selectedProjects,
      statusMapping: dto.statusMapping ?? null,
      roleMapping: dto.roleMapping ?? null,
      options: {
        importAttachments: dto.options?.importAttachments ?? false,
        importComments: dto.options?.importComments ?? true,
        inviteMembers: dto.options?.inviteMembers ?? true,
      },
      status: 'pending',
      currentPhase: 0,
      currentOffset: 0,
      totalProjects: dto.projectKeys.length,
    });

    // Enqueue BullMQ job
    await this.migrationQueue.add(
      'jira-migration',
      {
        runId: run.id,
        organizationId,
        connectionId: run.connectionId,
      },
      {
        jobId: `migration-${run.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
      },
    );

    this.logger.log(`Enqueued migration job for run ${run.id}`);

    return { runId: run.id };
  }

  // ── 4. Poll status ────────────────────────────────────────────────────────

  async getStatus(runId: string, organizationId: string): Promise<JiraMigrationRun> {
    const run = await this.runRepository.findOne({
      where: { id: runId, organizationId },
    });

    if (!run) throw new NotFoundException('Migration run not found');

    return run;
  }

  // ── 5. Retry failed run ───────────────────────────────────────────────────

  async retry(runId: string, organizationId: string): Promise<{ runId: string }> {
    const run = await this.runRepository.findOne({
      where: { id: runId, organizationId },
    });

    if (!run) throw new NotFoundException('Migration run not found');
    if (run.status !== 'failed' && run.status !== 'cancelled') {
      throw new BadRequestException('Only failed or cancelled runs can be retried');
    }

    await this.runRepository.update(run.id, {
      status: 'pending',
      // Keep currentPhase so we resume from where we left off
    });

    await this.migrationQueue.add(
      'jira-migration',
      {
        runId: run.id,
        organizationId,
        connectionId: run.connectionId,
      },
      {
        jobId: `migration-${run.id}-retry-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
      },
    );

    return { runId: run.id };
  }

  // ── 6. Full report ────────────────────────────────────────────────────────

  async getReport(runId: string, organizationId: string): Promise<JiraMigrationRun> {
    const run = await this.runRepository.findOne({
      where: { id: runId, organizationId },
    });
    if (!run) throw new NotFoundException('Migration run not found');
    return run;
  }

  // ── 7. History ────────────────────────────────────────────────────────────

  async getHistory(
    organizationId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: JiraMigrationRun[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.runRepository.findAndCount({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      select: [
        'id',
        'organizationId',
        'status',
        'currentPhase',
        'totalProjects',
        'processedProjects',
        'totalIssues',
        'processedIssues',
        'failedIssues',
        'selectedProjects',
        'options',
        'startedAt',
        'completedAt',
        'createdAt',
        'updatedAt',
      ],
    });

    return { data, total, page, limit };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async findRun(runId: string, organizationId: string): Promise<JiraMigrationRun> {
    const run = await this.runRepository.findOne({
      where: { id: runId, organizationId },
    });
    if (!run) throw new NotFoundException('Migration run not found');
    return run;
  }

  private async getCredentials(run: JiraMigrationRun) {
    if (!run.connectionId) {
      throw new BadRequestException('No Jira connection linked to this run');
    }

    const conn = await this.connectionRepository.findOne({
      where: { id: run.connectionId, organizationId: run.organizationId, isActive: true },
      select: ['id', 'organizationId', 'jiraUrl', 'jiraEmail', 'apiTokenEnc', 'isActive'],
    });

    if (!conn) throw new NotFoundException('Jira connection not found or inactive');

    const { decrypt } = await import('../import/crypto.util');
    const apiToken = decrypt(conn.apiTokenEnc, this.appSecret);

    return {
      baseUrl: conn.jiraUrl,
      email: conn.jiraEmail,
      apiToken,
    };
  }

  private extractOrgName(baseUrl: string): string {
    try {
      const hostname = new URL(baseUrl).hostname;
      // "acme.atlassian.net" → "acme"
      return hostname.split('.')[0] || hostname;
    } catch {
      return baseUrl;
    }
  }
}
