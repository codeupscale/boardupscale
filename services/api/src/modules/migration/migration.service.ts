import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as querystring from 'querystring';
import { createHmac, timingSafeEqual } from 'crypto';

import { JiraMigrationRun } from './entities/jira-migration-run.entity';
import { JiraConnection } from '../import/entities/jira-connection.entity';
import { JiraApiService } from '../import/jira-api.service';
import { encrypt } from '../import/crypto.util';

import { ConnectJiraDto } from './dto/connect-jira.dto';
import { StartMigrationDto, PreviewMigrationDto } from './dto/start-migration.dto';

export interface ConnectResult {
  runId: string;
  connectionId: string;
  displayName: string;
  orgName: string;
  projectCount: number;
  memberCount: number;
  projects: Array<{ key: string; name: string; description?: string }>;
}

export interface JiraMember {
  accountId: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  active: boolean;
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
      connectionId: savedConn.id,
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
        // Pass selected member IDs so the worker can filter them.
        // Empty array or undefined means "import all".
        selectedMemberIds: dto.selectedMemberIds ?? [],
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

  // ── 8. Get Jira projects for selection (used after OAuth when project list is empty) ──

  async getMigrationProjects(
    connectionId: string,
    organizationId: string,
  ): Promise<Array<{ key: string; name: string; description?: string }>> {
    const conn = await this.connectionRepository.findOne({
      where: { id: connectionId, organizationId, isActive: true },
      select: ['id', 'organizationId', 'jiraUrl', 'jiraEmail', 'apiTokenEnc', 'refreshTokenEnc', 'tokenExpiresAt', 'isActive'],
    });
    if (!conn) throw new NotFoundException('Jira connection not found or inactive');

    await this.refreshOAuthTokenIfNeeded(conn);

    const { decrypt } = await import('../import/crypto.util');
    const credentials = {
      baseUrl: conn.jiraUrl,
      email: conn.jiraEmail,
      apiToken: decrypt(conn.apiTokenEnc, this.appSecret),
    };

    const projects = await this.jiraApiService.listProjects(credentials).catch(() => []);
    return projects.map((p) => ({ key: p.key, name: p.name, description: p.description }));
  }

  // ── 9. Get Jira members for selection ─────────────────────────────────────

  async getMigrationMembers(
    connectionId: string,
    organizationId: string,
  ): Promise<JiraMember[]> {
    const conn = await this.connectionRepository.findOne({
      where: { id: connectionId, organizationId, isActive: true },
      select: ['id', 'organizationId', 'jiraUrl', 'jiraEmail', 'apiTokenEnc', 'refreshTokenEnc', 'tokenExpiresAt', 'isActive'],
    });
    if (!conn) throw new NotFoundException('Jira connection not found or inactive');

    await this.refreshOAuthTokenIfNeeded(conn);

    const { decrypt } = await import('../import/crypto.util');
    const credentials = {
      baseUrl: conn.jiraUrl,
      email: conn.jiraEmail,
      apiToken: decrypt(conn.apiTokenEnc, this.appSecret),
    };

    let users: Array<{ accountId: string; emailAddress?: string; displayName?: string; active?: boolean; avatarUrls?: Record<string, string> }> = [];
    try {
      users = await this.jiraApiService.fetchOrgUsers(credentials);
    } catch (err: any) {
      this.logger.warn(`getMigrationMembers: fetchOrgUsers error — ${err.message}`);
    }

    return users.map((u) => ({
      accountId: u.accountId,
      displayName: u.displayName ?? u.emailAddress ?? u.accountId,
      email: u.emailAddress ?? null,
      avatarUrl: u.avatarUrls?.['48x48'] ?? null,
      active: u.active !== false,
    }));
  }

  // ── 10. Atlassian OAuth 2.0 — 3-legged flow ───────────────────────────────

  /**
   * Signed state for OAuth (browser redirects cannot send Authorization headers).
   * Verified on `/oauth/callback` with APP_SECRET.
   */
  signOAuthState(userId: string, organizationId: string): string {
    const secret = this.configService.get<string>('app.secret');
    const exp = Date.now() + 15 * 60 * 1000;
    const body = Buffer.from(JSON.stringify({ userId, organizationId, exp }), 'utf8').toString(
      'base64url',
    );
    const sig = createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  verifyOAuthState(state: string): { userId: string; organizationId: string } {
    const secret = this.configService.get<string>('app.secret');
    const parts = state.split('.');
    if (parts.length !== 2) {
      throw new UnauthorizedException('Invalid OAuth state');
    }
    const [body, sig] = parts;
    const expectedSig = createHmac('sha256', secret).update(body).digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Invalid OAuth state');
    }
    let parsed: { userId: string; organizationId: string; exp: number };
    try {
      parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid OAuth state');
    }
    if (!parsed.exp || parsed.exp < Date.now()) {
      throw new UnauthorizedException('OAuth session expired — please start again from the migration wizard');
    }
    if (!parsed.userId || !parsed.organizationId) {
      throw new UnauthorizedException('Invalid OAuth state');
    }
    return { userId: parsed.userId, organizationId: parsed.organizationId };
  }

  buildOAuthAuthorizeUrl(state: string): string {
    const clientId = this.configService.get<string>('atlassian.clientId');
    const callbackUrl = this.configService.get<string>('atlassian.callbackUrl');

    if (!clientId) {
      throw new InternalServerErrorException(
        'ATLASSIAN_CLIENT_ID is not configured. Set it in the environment and restart the API.',
      );
    }

    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: clientId,
      // read:jira-work     — issues, projects, statuses (REST API v3)
      // read:jira-user     — user/member data
      // read:board-scope:jira-software  — board listing (Agile API)
      // read:sprint:jira-software       — sprint data (Agile API)
      // offline_access     — enables refresh token for long migrations
      scope: 'read:jira-work read:jira-user read:board-scope:jira-software read:sprint:jira-software offline_access',
      redirect_uri: callbackUrl,
      state,
      response_type: 'code',
      prompt: 'consent',
    });

    return `https://auth.atlassian.com/authorize?${params.toString()}`;
  }

  async exchangeOAuthCode(
    code: string,
    organizationId: string,
    userId: string,
  ): Promise<{ runId: string; connectionId: string; orgName: string; projectCount: number; memberCount: number }> {
    const clientId = this.configService.get<string>('atlassian.clientId');
    const clientSecret = this.configService.get<string>('atlassian.clientSecret');
    const callbackUrl = this.configService.get<string>('atlassian.callbackUrl');

    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException(
        'Atlassian OAuth credentials are not configured (ATLASSIAN_CLIENT_ID / ATLASSIAN_CLIENT_SECRET).',
      );
    }

    // Exchange code for tokens
    const tokenResponse = await this.atlassianTokenRequest({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl,
    });

    const { access_token, refresh_token } = tokenResponse as {
      access_token: string;
      refresh_token?: string;
    };

    // Fetch accessible resources to get the cloud site
    const resources = await this.atlassianApiGet<
      Array<{ id: string; name: string; url: string; scopes: string[] }>
    >(access_token, 'https://api.atlassian.com/oauth/token/accessible-resources');

    if (!resources.length) {
      throw new BadRequestException(
        'No Atlassian cloud sites found for this account. Ensure the account has access to at least one Jira Cloud instance.',
      );
    }

    const site = resources[0]; // Use first (most common case)
    // Atlassian OAuth Bearer tokens must be used against api.atlassian.com/ex/jira/{cloudId},
    // NOT against the site URL (e.g. codeupscale.atlassian.net). Using the site URL causes
    // silent 401/403 errors. The REST path is appended by JiraApiService.get().
    const apiBaseUrl = `https://api.atlassian.com/ex/jira/${site.id}`;

    // Fetch Jira projects via the cloud API
    const credentials = {
      baseUrl: apiBaseUrl,
      email: '',          // Not used for OAuth — token auth
      apiToken: access_token, // OAuth bearer
    };

    const projects = await this.jiraApiService.listProjects(credentials).catch(() => []);

    let memberCount = 0;
    try {
      const members = await this.jiraApiService.fetchOrgUsers(credentials);
      memberCount = members.length;
    } catch {
      // non-fatal
    }

    // Fetch the authenticated user's display name
    const me = await this.atlassianApiGet<{ displayName?: string; emailAddress?: string }>(
      access_token,
      `https://api.atlassian.com/ex/jira/${site.id}/rest/api/3/myself`,
    ).catch(() => ({} as any));

    // Encrypt and store both the access token and (if present) the refresh token.
    // Atlassian access tokens expire after 3600 seconds; we store tokenExpiresAt
    // so the service and worker can proactively refresh before a long migration fails.
    const tokenEnc = encrypt(access_token, this.appSecret);
    const refreshTokenEnc = refresh_token ? encrypt(refresh_token, this.appSecret) : null;
    const tokenExpiresAt = new Date(Date.now() + 3600 * 1000); // Atlassian access tokens = 1 hour

    await this.connectionRepository.update({ organizationId }, { isActive: false });

    const connection = this.connectionRepository.create({
      organizationId,
      createdById: userId,
      // Store the API base URL (api.atlassian.com/ex/jira/{id}) so all subsequent
      // credential lookups (preview, migration worker, member fetch) use the correct URL.
      jiraUrl: apiBaseUrl,
      // OAuth connections use Bearer auth — email must be empty so JiraApiService
      // sends Authorization: Bearer instead of Authorization: Basic email:token
      jiraEmail: '',
      apiTokenEnc: tokenEnc,
      refreshTokenEnc,
      tokenExpiresAt,
      isActive: true,
      lastTestedAt: new Date(),
      lastTestOk: true,
    });
    const savedConn = await this.connectionRepository.save(connection);

    const run = this.runRepository.create({
      organizationId,
      triggeredById: userId,
      connectionId: savedConn.id,
      status: 'pending',
      currentPhase: 0,
    });
    const savedRun = await this.runRepository.save(run);

    this.logger.log(
      `OAuth migration run ${savedRun.id} created for org ${organizationId} — site: ${site.name}`,
    );

    return {
      runId: savedRun.id,
      connectionId: savedConn.id,
      orgName: site.name,
      projectCount: projects.length,
      memberCount,
    };
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
      select: ['id', 'organizationId', 'jiraUrl', 'jiraEmail', 'apiTokenEnc', 'refreshTokenEnc', 'tokenExpiresAt', 'isActive'],
    });

    if (!conn) throw new NotFoundException('Jira connection not found or inactive');

    // Auto-refresh OAuth token if it expires within the next 5 minutes
    await this.refreshOAuthTokenIfNeeded(conn);

    const { decrypt } = await import('../import/crypto.util');
    const apiToken = decrypt(conn.apiTokenEnc, this.appSecret);

    return {
      baseUrl: conn.jiraUrl,
      email: conn.jiraEmail,
      apiToken,
    };
  }

  /**
   * Refreshes the Atlassian OAuth access token for a connection if it expires
   * within the next 5 minutes. Mutates `conn.apiTokenEnc` and `conn.tokenExpiresAt`
   * in-place and persists both to the DB.
   *
   * No-ops for API-token connections (tokenExpiresAt is null).
   */
  private async refreshOAuthTokenIfNeeded(conn: any): Promise<void> {
    if (!conn.tokenExpiresAt || !conn.refreshTokenEnc) return;

    const expiresAt = new Date(conn.tokenExpiresAt).getTime();
    const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
    if (expiresAt > fiveMinutesFromNow) return; // still fresh

    this.logger.log(`Refreshing OAuth token for connection ${conn.id} (expires ${conn.tokenExpiresAt})`);

    const clientId = this.configService.get<string>('atlassian.clientId');
    const clientSecret = this.configService.get<string>('atlassian.clientSecret');
    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException('Atlassian OAuth credentials not configured for token refresh');
    }

    const { decrypt } = await import('../import/crypto.util');
    const refreshToken = decrypt(conn.refreshTokenEnc, this.appSecret);

    const tokenResponse = await this.atlassianTokenRequest({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }) as { access_token: string; refresh_token?: string };

    const newAccessToken = tokenResponse.access_token;
    const newRefreshToken = tokenResponse.refresh_token; // Atlassian may rotate the refresh token
    const newExpiresAt = new Date(Date.now() + 3600 * 1000);

    const newAccessTokenEnc = encrypt(newAccessToken, this.appSecret);
    const newRefreshTokenEnc = newRefreshToken
      ? encrypt(newRefreshToken, this.appSecret)
      : conn.refreshTokenEnc; // keep existing if not rotated

    await this.connectionRepository.update(conn.id, {
      apiTokenEnc: newAccessTokenEnc,
      refreshTokenEnc: newRefreshTokenEnc,
      tokenExpiresAt: newExpiresAt,
    });

    // Mutate in-place so the caller gets the fresh token without re-fetching
    conn.apiTokenEnc = newAccessTokenEnc;
    conn.tokenExpiresAt = newExpiresAt;

    this.logger.log(`OAuth token refreshed for connection ${conn.id}, new expiry: ${newExpiresAt}`);
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

  /** POST to Atlassian token endpoint and return the parsed JSON response. */
  private atlassianTokenRequest(body: Record<string, string>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const payload = querystring.stringify(body);
      const options: https.RequestOptions = {
        hostname: 'auth.atlassian.com',
        path: '/oauth/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 15000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            return void reject(
              new BadRequestException(
                `Atlassian token exchange failed (${res.statusCode}): ${data.slice(0, 300)}`,
              ),
            );
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new InternalServerErrorException('Invalid JSON from Atlassian token endpoint'));
          }
        });
      });

      req.on('error', (err) => reject(new InternalServerErrorException(`Atlassian token request error: ${err.message}`)));
      req.on('timeout', () => { req.destroy(); reject(new InternalServerErrorException('Atlassian token request timed out')); });
      req.write(payload);
      req.end();
    });
  }

  /** GET a JSON resource from the Atlassian API using an OAuth bearer token. */
  private atlassianApiGet<T>(accessToken: string, url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const options: https.RequestOptions = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        timeout: 15000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            return void reject(
              new BadRequestException(`Atlassian API error (${res.statusCode}): ${data.slice(0, 300)}`),
            );
          }
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new InternalServerErrorException('Invalid JSON from Atlassian API'));
          }
        });
      });

      req.on('error', (err) => reject(new InternalServerErrorException(`Atlassian API request error: ${err.message}`)));
      req.on('timeout', () => { req.destroy(); reject(new InternalServerErrorException('Atlassian API request timed out')); });
      req.end();
    });
  }
}
