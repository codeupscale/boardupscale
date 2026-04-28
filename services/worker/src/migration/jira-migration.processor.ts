/**
 * JiraMigrationProcessor
 *
 * BullMQ worker that executes a Jira → Boardupscale migration run in six
 * resumable phases:
 *
 *   1  members    — upsert Jira users into users + org_members
 *   2  projects   — create projects, boards, and issue statuses
 *   3  sprints    — create sprint records per project
 *   4  issues     — paginated JQL fetch + upsert (cursor-resumed)
 *   5  comments   — insert issue comments
 *   6  attachments — optional MinIO upload
 *
 * Progress is written to the jira_migration_runs row every 5 seconds and
 * a Socket.io event is emitted on every update.
 *
 * Rate-limiting: 100ms delay between Jira API pages (≈10 req/s max).
 */

import { Worker, Job } from 'bullmq';
import { Pool, PoolClient } from 'pg';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import IORedis from 'ioredis';
import { createRedisConnection } from '../redis';
import { config } from '../config';
import { adfToText } from './adf-helpers';
import { S3Client, HeadBucketCommand, CreateBucketCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { randomUUID } from 'crypto';
import { PassThrough } from 'stream';

// ─── Constants ───────────────────────────────────────────────────────────────

const QUEUE_NAME = 'jira-migration';
const PHASE_MEMBERS = 1;
const PHASE_PROJECTS = 2;
const PHASE_SPRINTS = 3;
const PHASE_ISSUES = 4;
const PHASE_COMMENTS = 5;
const PHASE_ATTACHMENTS = 6;
const PHASE_PROJECT_MEMBER_SYNC = 15; // between phase 1 and 2; stored as integer

const REQUEST_DELAY_MS = 100; // 10 req/s courtesy throttle
const PROGRESS_FLUSH_MS = 5000; // DB write frequency

// ─── Types ────────────────────────────────────────────────────────────────────

interface MigrationJobData {
  runId: string;
  organizationId: string;
  connectionId: string;
  /**
   * null/undefined = import all members.
   * [] = import none.
   * [...ids] = import only the specified Jira accountIds.
   */
  selectedMemberIds?: string[] | null;
  /**
   * When true, the worker exits after Phase 1 + Phase 1b (members + project
   * member sync) and skips Phases 2–6. Used by the "Sync Members from Jira"
   * button to pick up newly added Jira users without re-running the full
   * migration.
   */
  membersOnly?: boolean;
}

interface JiraCredentials {
  baseUrl: string;
  email: string;
  apiToken: string;
}

interface JiraApiAttachment {
  id: string;
  filename: string;
  content: string;    // Direct authenticated download URL
  mimeType: string;
  size: number;
  author?: { accountId?: string; emailAddress?: string };
  created?: string;
}

interface RunState {
  id: string;
  organizationId: string;
  connectionId: string;
  triggeredById: string;
  status: string;
  currentPhase: number;
  currentOffset: number;
  completedPhases: number[];
  selectedProjects: Array<{ key: string; name: string; issueCount: number }>;
  statusMapping: Record<string, string> | null;
  roleMapping: Record<string, string> | null;
  options: {
    importAttachments: boolean;
    importComments: boolean;
    inviteMembers: boolean;
  } | null;
  totalProjects: number;
  processedProjects: number;
  totalIssues: number;
  processedIssues: number;
  failedIssues: number;
  totalMembers: number;
  processedMembers: number;
  totalSprints: number;
  processedSprints: number;
  totalComments: number;
  processedComments: number;
  totalAttachments: number;
  processedAttachments: number;
  errorLog: string[];
  jiraProjectIdToLocalId: Record<string, string>;
  jiraUserEmailToLocalId: Record<string, string>;
  /** Parallel map keyed by Jira accountId — more reliable than email for Jira Cloud (GDPR hides emails). */
  jiraAccountIdToLocalId: Record<string, string>;
  jiraIssueKeyToLocalId: Record<string, string>;
  jiraSprintIdToLocalId: Record<string, string>;
  /**
   * Per-project map: projectId → (jiraStatusName → localStatusId).
   * Populated in Phase 2 so Phase 4 can resolve status_id without extra queries.
   */
  projectStatusMap: Record<string, Record<string, string>>;
  /**
   * null = import all members (no filter applied).
   * [] = import none.
   * [...ids] = import only the specified Jira accountIds.
   */
  selectedMemberIds: string[] | null;
  /** When true, worker exits after Phase 1b. See MigrationJobData.membersOnly. */
  membersOnly: boolean;
  /**
   * Issues where inline comments in Phase 4 were partial (comment.total > comment.maxResults).
   * Maps jiraKey → startAt for the next comment page to fetch in Phase 5.
   * NOT persisted to DB — only lives in memory during the current process run.
   * If the worker restarts, Phase 5 falls back to fetching all issues (isResume path).
   */
  issuesNeedingCommentPagination?: Map<string, number>;
  /**
   * Total inline comments processed during Phase 4 (not persisted — in-memory only).
   * Carried forward to Phase 5 so its final counter update adds to, rather than
   * overwrites, the Phase 4 count.  Zero on resume (Phase 5 re-fetches everything).
   */
  inlineCommentsInserted?: number;
}

// ─── Jira HTTP client (no axios) ─────────────────────────────────────────────

function jiraGet<T>(
  credentials: JiraCredentials,
  path: string,
  attempt = 1,
): Promise<T> {
  // OAuth connections have an empty email — use Bearer auth.
  // API-token connections have a non-empty email — use Basic auth.
  const authHeader = credentials.email
    ? `Basic ${Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64')}`
    : `Bearer ${credentials.apiToken}`;

  const rawUrl = credentials.baseUrl.replace(/\/$/, '') + path;
  const parsed = new URL(rawUrl);
  const isHttps = parsed.protocol === 'https:';
  const transport = isHttps ? https : http;

  const options: http.RequestOptions = {
    hostname: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    timeout: 20000,
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString()));
      res.on('end', () => {
        if (res.statusCode === 429 && attempt === 1) {
          return void setTimeout(() => jiraGet<T>(credentials, path, 2).then(resolve).catch(reject), 2000);
        }
        if (res.statusCode && res.statusCode >= 400) {
          return void reject(new Error(`Jira API ${res.statusCode}: ${body.slice(0, 300)}`));
        }
        try { resolve(JSON.parse(body) as T); }
        catch { reject(new Error(`Non-JSON from Jira: ${body.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Jira request timed out')); });
    req.end();
  });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ─── AES-256-GCM decrypt (mirrors the API service crypto.util.ts) ─────────────

function decryptToken(encoded: string, secret: string): string {
  const key = crypto.createHash('sha256').update(secret).digest();
  const packed = Buffer.from(encoded, 'base64');
  const iv = packed.slice(0, 16);
  const tag = packed.slice(packed.length - 16);
  const ciphertext = packed.slice(16, packed.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function loadRun(client: PoolClient, runId: string, organizationId: string): Promise<RunState> {
  const { rows } = await client.query<RunState>(
    `SELECT id, organization_id AS "organizationId", connection_id AS "connectionId",
            triggered_by_id AS "triggeredById",
            status, current_phase AS "currentPhase", current_offset AS "currentOffset",
            COALESCE(completed_phases, '[]') AS "completedPhases",
            selected_projects AS "selectedProjects",
            status_mapping AS "statusMapping",
            role_mapping AS "roleMapping",
            options,
            total_projects AS "totalProjects",
            processed_projects AS "processedProjects",
            total_issues AS "totalIssues",
            processed_issues AS "processedIssues",
            failed_issues AS "failedIssues",
            total_members AS "totalMembers",
            processed_members AS "processedMembers",
            total_sprints AS "totalSprints",
            processed_sprints AS "processedSprints",
            total_comments AS "totalComments",
            processed_comments AS "processedComments",
            total_attachments AS "totalAttachments",
            processed_attachments AS "processedAttachments",
            COALESCE(error_log, '[]') AS "errorLog"
     FROM jira_migration_runs WHERE id = $1 AND organization_id = $2`,
    [runId, organizationId],
  );
  if (!rows[0]) throw new Error(`Migration run ${runId} not found for org ${organizationId}`);

  return {
    ...rows[0],
    completedPhases: rows[0].completedPhases ?? [],
    errorLog: rows[0].errorLog ?? [],
    jiraProjectIdToLocalId: {},
    jiraUserEmailToLocalId: {},
    jiraAccountIdToLocalId: {},
    jiraIssueKeyToLocalId: {},
    jiraSprintIdToLocalId: {},
    projectStatusMap: {},
    selectedMemberIds: [],
    membersOnly: false,
  };
}

async function loadCredentials(client: PoolClient, connectionId: string, organizationId: string): Promise<JiraCredentials> {
  const { rows } = await client.query(
    `SELECT jira_url AS "baseUrl", jira_email AS email, api_token_enc AS "apiTokenEnc",
            refresh_token_enc AS "refreshTokenEnc", token_expires_at AS "tokenExpiresAt"
     FROM jira_connections WHERE id = $1 AND organization_id = $2`,
    [connectionId, organizationId],
  );
  if (!rows[0]) throw new Error(`Jira connection ${connectionId} not found for org ${organizationId}`);

  const row = rows[0];

  // Proactively refresh the OAuth access token if it expires within 5 minutes.
  // API-token connections have null tokenExpiresAt — skip refresh for those.
  if (row.refreshTokenEnc && row.tokenExpiresAt) {
    const expiresAt = new Date(row.tokenExpiresAt).getTime();
    const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
    if (expiresAt <= fiveMinutesFromNow) {
      console.log(`[Migration] Refreshing OAuth token for connection ${connectionId} (expires ${row.tokenExpiresAt})`);
      const freshToken = await refreshAtlassianToken(client, connectionId, row.refreshTokenEnc);
      if (freshToken) {
        row.apiTokenEnc = freshToken;
      }
    }
  }

  const { baseUrl, email, apiTokenEnc } = row;
  const apiToken = decryptToken(apiTokenEnc, config.appSecret);
  return { baseUrl, email, apiToken };
}

/**
 * Exchange a refresh token for a new Atlassian access token.
 * Updates api_token_enc, refresh_token_enc, and token_expires_at in DB.
 * Returns the new (encrypted) apiTokenEnc value, or null on failure.
 */
async function refreshAtlassianToken(
  client: PoolClient,
  connectionId: string,
  refreshTokenEnc: string,
): Promise<string | null> {
  const { clientId, clientSecret } = config.atlassian;
  if (!clientId || !clientSecret) {
    console.error('[Migration] ATLASSIAN_CLIENT_ID/SECRET not set — cannot refresh token');
    return null;
  }

  const refreshToken = decryptToken(refreshTokenEnc, config.appSecret);

  try {
    const tokenResponse = await atlassianTokenPost({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }) as { access_token: string; refresh_token?: string };

    const newAccessTokenEnc = encryptToken(tokenResponse.access_token, config.appSecret);
    const newRefreshTokenEnc = tokenResponse.refresh_token
      ? encryptToken(tokenResponse.refresh_token, config.appSecret)
      : refreshTokenEnc; // keep existing if Atlassian doesn't rotate
    const newExpiresAt = new Date(Date.now() + 3600 * 1000);

    await client.query(
      `UPDATE jira_connections
         SET api_token_enc = $1, refresh_token_enc = $2, token_expires_at = $3
       WHERE id = $4`,
      [newAccessTokenEnc, newRefreshTokenEnc, newExpiresAt, connectionId],
    );

    console.log(`[Migration] OAuth token refreshed for connection ${connectionId}, new expiry: ${newExpiresAt}`);
    return newAccessTokenEnc;
  } catch (err: any) {
    console.error(`[Migration] OAuth token refresh failed for connection ${connectionId}: ${err.message}`);
    return null; // non-fatal — let the migration attempt proceed with existing token
  }
}

/** AES-256-GCM encrypt — mirrors crypto.util.ts in the API service */
function encryptToken(plaintext: string, secret: string): string {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

/** POST to Atlassian /oauth/token — returns parsed JSON response */
function atlassianTokenPost(body: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = Object.entries(body)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const options: https.RequestOptions = {
      hostname: 'auth.atlassian.com',
      path: '/oauth/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          return void reject(new Error(`Atlassian token refresh failed (${res.statusCode}): ${data.slice(0, 200)}`));
        }
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Non-JSON from Atlassian: ${data.slice(0, 100)}`)); }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Atlassian token request timed out')); });
    req.write(payload);
    req.end();
  });
}

async function updateRunProgress(
  client: PoolClient,
  runId: string,
  state: Partial<RunState> & { status?: string; completedPhase?: number },
  io?: IORedis | null,
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [runId];
  let idx = 2;

  const add = (col: string, val: unknown) => {
    fields.push(`${col} = $${idx++}`);
    values.push(val);
  };

  if (state.status !== undefined) add('status', state.status);
  if (state.currentPhase !== undefined) add('current_phase', state.currentPhase);
  if (state.currentOffset !== undefined) add('current_offset', state.currentOffset);
  if (state.totalProjects !== undefined) add('total_projects', state.totalProjects);
  if (state.processedProjects !== undefined) add('processed_projects', state.processedProjects);
  if (state.totalIssues !== undefined) add('total_issues', state.totalIssues);
  if (state.processedIssues !== undefined) add('processed_issues', state.processedIssues);
  if (state.failedIssues !== undefined) add('failed_issues', state.failedIssues);
  if (state.totalMembers !== undefined) add('total_members', state.totalMembers);
  if (state.processedMembers !== undefined) add('processed_members', state.processedMembers);
  if (state.totalSprints !== undefined) add('total_sprints', state.totalSprints);
  if (state.processedSprints !== undefined) add('processed_sprints', state.processedSprints);
  if (state.totalComments !== undefined) add('total_comments', state.totalComments);
  if (state.processedComments !== undefined) add('processed_comments', state.processedComments);
  if (state.totalAttachments !== undefined) add('total_attachments', state.totalAttachments);
  if (state.processedAttachments !== undefined) add('processed_attachments', state.processedAttachments);

  if (state.completedPhase !== undefined) {
    fields.push(`completed_phases = completed_phases || $${idx++}::jsonb`);
    values.push(JSON.stringify([state.completedPhase]));
  }

  if (state.errorLog !== undefined) {
    add('error_log', JSON.stringify(state.errorLog));
  }

  if (state.status === 'processing' && state.currentPhase !== undefined && state.currentPhase > 0) {
    fields.push(`started_at = COALESCE(started_at, NOW())`);
  }

  if (state.status === 'completed' || state.status === 'failed') {
    fields.push(`completed_at = NOW()`);
  }

  if (fields.length === 0) return;

  await client.query(
    `UPDATE jira_migration_runs SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1`,
    values,
  );

  // Publish progress via Redis pub/sub so the API's Socket.io server can relay it
  if (io) {
    io.publish('migration:progress', JSON.stringify({
      runId,
      phase: state.currentPhase,
      status: state.status,
      completedPhases: state.completedPhases ?? [],
      counts: {
        processedProjects: state.processedProjects,
        totalProjects: state.totalProjects,
        processedIssues: state.processedIssues,
        totalIssues: state.totalIssues,
        failedIssues: state.failedIssues,
        processedMembers: state.processedMembers,
        totalMembers: state.totalMembers,
        processedSprints: state.processedSprints,
        totalSprints: state.totalSprints,
        processedComments: state.processedComments,
        totalComments: state.totalComments,
        processedAttachments: state.processedAttachments,
        totalAttachments: state.totalAttachments,
      },
    })).catch(() => {});
  }
}

function addError(state: RunState, msg: string) {
  state.errorLog = [...(state.errorLog ?? []), msg].slice(-100);
}

/**
 * Sentinel error thrown when the DB run status has been set to 'cancelled'.
 * Caught in processJob to stop cleanly without marking the run as 'failed'.
 */
class MigrationCancelledError extends Error {
  constructor(runId: string) {
    super(`Migration run ${runId} was cancelled`);
    this.name = 'MigrationCancelledError';
  }
}

/**
 * Re-read the run status from DB and throw MigrationCancelledError if it has
 * been set to 'cancelled' while the job was executing.
 * Called between each phase so cancellation takes effect within one phase boundary.
 */
async function checkCancelled(client: PoolClient, runId: string): Promise<void> {
  const { rows } = await client.query<{ status: string }>(
    `SELECT status FROM jira_migration_runs WHERE id = $1`,
    [runId],
  );
  if (rows[0]?.status === 'cancelled') {
    throw new MigrationCancelledError(runId);
  }
}

/**
 * Ensure state.triggeredById resolves to a real, existing user in the org.
 *
 * If the user who triggered the migration has since been deleted, all FK
 * references to triggeredById (activities, attachments, project members, etc.)
 * would throw a foreign-key constraint violation and abort the phase.
 *
 * Fallback chain:
 *   1. The original triggeredById exists in users + is org member → keep it.
 *   2. Fall back to any 'admin' in the org.
 *   3. Fall back to any org member at all.
 *   4. Leave as-is (will fail at the FK — at least the error is explicit).
 */
async function resolveSafeTriggeredById(
  client: PoolClient,
  state: RunState,
): Promise<void> {
  if (!state.triggeredById) return;

  const { rows: existing } = await client.query<{ id: string }>(
    `SELECT u.id FROM users u
     WHERE u.id = $1
       AND (u.organization_id = $2
            OR EXISTS (SELECT 1 FROM organization_members om
                       WHERE om.user_id = u.id AND om.organization_id = $2))
     LIMIT 1`,
    [state.triggeredById, state.organizationId],
  ).catch(() => ({ rows: [] as Array<{ id: string }> }));

  if (existing[0]) return; // still valid

  // Attempt fallback to an admin in the org
  const { rows: admins } = await client.query<{ id: string }>(
    `SELECT u.id FROM users u
     JOIN organization_members om ON om.user_id = u.id
     WHERE om.organization_id = $1 AND u.role = 'admin'
     ORDER BY u.created_at
     LIMIT 1`,
    [state.organizationId],
  ).catch(() => ({ rows: [] as Array<{ id: string }> }));

  if (admins[0]) {
    console.warn(
      `[Migration:${state.id}] triggeredById ${state.triggeredById} not found in org — ` +
      `falling back to admin ${admins[0].id}`,
    );
    state.triggeredById = admins[0].id;
    return;
  }

  // Final fallback: any org member
  const { rows: anyMember } = await client.query<{ id: string }>(
    `SELECT user_id AS id FROM organization_members
     WHERE organization_id = $1
     ORDER BY created_at
     LIMIT 1`,
    [state.organizationId],
  ).catch(() => ({ rows: [] as Array<{ id: string }> }));

  if (anyMember[0]) {
    console.warn(
      `[Migration:${state.id}] triggeredById ${state.triggeredById} not found — ` +
      `falling back to first org member ${anyMember[0].id}`,
    );
    state.triggeredById = anyMember[0].id;
  } else {
    console.error(
      `[Migration:${state.id}] triggeredById ${state.triggeredById} not found and no org members exist — ` +
      `FK violations may occur during migration`,
    );
  }
}

/**
 * Retry a phase function up to MAX_PHASE_RETRIES times with exponential backoff.
 * If the phase still fails after all retries the error is recorded but execution
 * continues to the next phase — a single failing phase must not abort the whole job.
 */
const MAX_PHASE_RETRIES = 3;
const PHASE_RETRY_BASE_DELAY_MS = 2000;

async function runPhaseWithRetry(
  phaseName: string,
  state: RunState,
  fn: () => Promise<void>,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_PHASE_RETRIES; attempt++) {
    try {
      await fn();
      return; // success
    } catch (err: any) {
      const msg = `[Phase:${phaseName}] attempt ${attempt}/${MAX_PHASE_RETRIES} failed: ${err.message}`;
      console.error(`[Migration:${state.id}] ${msg}`);
      addError(state, msg);

      if (attempt < MAX_PHASE_RETRIES) {
        const backoff = PHASE_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[Migration:${state.id}] Retrying ${phaseName} in ${backoff}ms...`);
        await delay(backoff);
      } else {
        console.error(`[Migration:${state.id}] Phase ${phaseName} gave up after ${MAX_PHASE_RETRIES} attempts. Continuing with next phase.`);
      }
    }
  }
}

// ─── Phase 1: Members ─────────────────────────────────────────────────────────

async function runMembersPhase(
  client: PoolClient,
  state: RunState,
  credentials: JiraCredentials,
  io: IORedis | null,
): Promise<void> {
  console.log(`[Migration:${state.id}] Phase 1 — members`);

  let users: Array<{ accountId: string; emailAddress?: string; displayName?: string }> = [];
  try {
    let startAt = 0;
    const PAGE_SIZE = 50;
    let hasMore = true;
    while (hasMore) {
      const page = await jiraGet<typeof users>(
        credentials,
        `/rest/api/3/users/search?startAt=${startAt}&maxResults=${PAGE_SIZE}&includeInactive=true`,
      );
      if (!Array.isArray(page) || page.length === 0) { hasMore = false; break; }
      users.push(...page);
      hasMore = page.length === PAGE_SIZE;
      startAt += PAGE_SIZE;
      if (hasMore) await delay(REQUEST_DELAY_MS);
    }
  } catch (err: any) {
    addError(state, `members fetch: ${err.message}`);
  }

  // null = import all (no filter UI shown), [] = import none, [...ids] = specific selection
  const filterIds = state.selectedMemberIds != null
    ? new Set(state.selectedMemberIds)
    : null; // null means "no filter — import everyone"

  const filteredUsers = filterIds !== null
    ? users.filter((u) => filterIds.has(u.accountId))
    : users;

  // Build the list of rows-to-upsert, and DEDUPLICATE by email.
  // Jira sometimes returns two accounts sharing one emailAddress (deactivated +
  // active duplicates, or the same person with two Atlassian accounts). PostgreSQL
  // rejects a bulk ON CONFLICT DO UPDATE that proposes the same conflict key
  // twice ("cannot affect row a second time") — which previously dropped the
  // entire chunk silently.
  interface MemberRow {
    email: string;
    displayName: string;
    role: 'admin' | 'manager' | 'member' | 'viewer';
    accountId: string;
    hasRealEmail: boolean;
    /** true = active in Jira; false = deactivated/inactive in Jira */
    isJiraActive: boolean;
  }
  const rowsByEmail = new Map<string, MemberRow>();
  let emailDuplicates = 0;
  for (const u of filteredUsers) {
    const hasRealEmail = !!u.emailAddress;
    const email = hasRealEmail
      ? u.emailAddress!.toLowerCase()
      : `jira-${u.accountId}@migrated.jira.local`;
    const displayName = u.displayName || email.split('@')[0];
    const roleMappingRecord = state.roleMapping ?? {};
    const mapped = roleMappingRecord[u.accountId] ?? roleMappingRecord[email] ?? 'member';
    const role = (['admin', 'manager', 'member', 'viewer'] as const).includes(mapped as any)
      ? (mapped as MemberRow['role'])
      : 'member';
    // `active` field is present on Jira Cloud user objects; absent = assume active
    const isJiraActive = (u as any).active !== false;
    if (rowsByEmail.has(email)) {
      emailDuplicates++;
      // Keep the first one, but if the existing one has no displayName and the
      // new one does, merge. accountId stays with the first (deterministic).
      const prev = rowsByEmail.get(email)!;
      if (!prev.displayName && displayName) prev.displayName = displayName;
      continue;
    }
    rowsByEmail.set(email, { email, displayName, role, accountId: u.accountId, hasRealEmail, isJiraActive });
  }
  if (emailDuplicates > 0) {
    const msg = `Collapsed ${emailDuplicates} Jira users sharing an email (kept first per email)`;
    console.log(`[Migration:${state.id}] ${msg}`);
    addError(state, msg);
  }
  const dedupedRows = Array.from(rowsByEmail.values());

  await updateRunProgress(client, state.id, {
    status: 'processing',
    currentPhase: PHASE_MEMBERS,
    totalMembers: dedupedRows.length,
  }, io);

  const MEMBER_CHUNK = 500;
  let processed = 0;
  let insertFailures = 0;
  for (let ci = 0; ci < dedupedRows.length; ci += MEMBER_CHUNK) {
    const chunk = dedupedRows.slice(ci, ci + MEMBER_CHUNK);
    if (!chunk.length) continue;

    const placeholders: string[] = [];
    const params: unknown[] = [];
    const chunkAccountIds: string[] = [];

    chunk.forEach((r, j) => {
      const b = j * 5;
      // Real-email + active/inactive in Jira: is_active=false (invite still needed), invitation_status='pending'
      // Synthetic-email (GDPR-obscured): is_active=true so they appear in dropdowns, invitation_status='none'
      const isActiveVal = r.hasRealEmail ? 'false' : 'true';
      const invStatus = r.hasRealEmail ? 'pending' : 'none';
      placeholders.push(`(gen_random_uuid(), $${b+1}::text, $${b+2}::text, $${b+3}::uuid, ${isActiveVal}, false, $${b+4}::text, $${b+5}::text, '${invStatus}', NOW(), NOW())`);
      params.push(r.email, r.displayName, state.organizationId, r.role, r.accountId);
      chunkAccountIds.push(r.accountId);
    });

    const runBulkInsert = () =>
      client.query<{ id: string; email: string }>(
        `INSERT INTO users (id, email, display_name, organization_id, is_active, email_verified, role, jira_account_id, invitation_status, created_at, updated_at)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (email) DO UPDATE SET
           display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), users.display_name),
           jira_account_id = COALESCE(EXCLUDED.jira_account_id, users.jira_account_id),
           updated_at = NOW()
         RETURNING id, email`,
        params,
      );

    let rows: Array<{ id: string; email: string }> = [];
    try {
      const res = await runBulkInsert();
      rows = res.rows;
    } catch (err: any) {
      // Bulk insert failed (e.g. a weirder conflict). Log loudly and fall back
      // to per-row inserts so one bad row doesn't drop the whole chunk.
      const msg = `members bulk upsert failed: ${err.message} — falling back to per-row inserts`;
      console.error(`[Migration:${state.id}] ${msg}`);
      addError(state, msg);

      for (const r of chunk) {
        try {
          const isActiveVal = r.hasRealEmail ? false : true;
          const invStatus = r.hasRealEmail ? 'pending' : 'none';
          const singleRes = await client.query<{ id: string; email: string }>(
            `INSERT INTO users (id, email, display_name, organization_id, is_active, email_verified, role, jira_account_id, invitation_status, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4, false, $5, $6, $7, NOW(), NOW())
             ON CONFLICT (email) DO UPDATE SET
               display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), users.display_name),
               jira_account_id = COALESCE(EXCLUDED.jira_account_id, users.jira_account_id),
               updated_at = NOW()
             RETURNING id, email`,
            [r.email, r.displayName, state.organizationId, isActiveVal, r.role, r.accountId, invStatus],
          );
          if (singleRes.rows[0]) rows.push(singleRes.rows[0]);
        } catch (singleErr: any) {
          // Composite collision: a user with this (org, jira_account_id) already
          // exists under a different email. Typical path: they accepted an
          // invite after a prior migration, their synthetic email was renamed
          // to their real email, but jira_account_id stayed set. Re-migration
          // proposes the synthetic email again — ON CONFLICT (email) doesn't
          // match the renamed row, the fresh INSERT hits the composite index.
          // Reuse the existing user instead of losing them from the map.
          if (/IDX_users_org_jira_account_id/.test(singleErr.message) && r.accountId) {
            try {
              const existing = await client.query<{ id: string; email: string }>(
                `SELECT id, email FROM users
                 WHERE organization_id = $1::uuid AND jira_account_id = $2
                 LIMIT 1`,
                [state.organizationId, r.accountId],
              );
              if (existing.rows[0]) {
                rows.push(existing.rows[0]);
                continue;
              }
            } catch {
              // fall through to the failure path below
            }
          }
          insertFailures++;
          const m = `member "${r.email}" skipped: ${singleErr.message}`;
          console.error(`[Migration:${state.id}] ${m}`);
          addError(state, m);
        }
      }
    }

    // Build lookup maps. Bulk-insert RETURNING order matches VALUES order, so
    // we can index by chunk position. For the per-row fallback we can't —
    // build a by-email map instead.
    const emailToIdMap = new Map<string, string>();
    for (const row of rows) emailToIdMap.set(row.email, row.id);

    const returnedUserIds: string[] = [];
    chunk.forEach((r) => {
      const id = emailToIdMap.get(r.email);
      if (!id) return;
      state.jiraUserEmailToLocalId[r.email] = id;
      state.jiraAccountIdToLocalId[r.accountId] = id;
      returnedUserIds.push(id);
      processed++;
    });

    // Dual-write: ensure organization_members rows exist for all upserted users.
    // This also links users who ALREADY existed in another org to this one, so
    // cross-org email conflicts don't leave the current org empty of members.
    if (returnedUserIds.length > 0) {
      await client.query(
        `INSERT INTO organization_members (id, user_id, organization_id, role, is_default, created_at, updated_at)
         SELECT gen_random_uuid(), unnest($1::uuid[]), $2::uuid, 'member', false, NOW(), NOW()
         ON CONFLICT (user_id, organization_id) DO NOTHING`,
        [returnedUserIds, state.organizationId],
      ).catch((err: any) => {
        console.error(`[Migration:${state.id}] members org_members upsert: ${err.message}`);
        addError(state, `members org_members upsert: ${err.message}`);
      });
    }
  }

  // W-3 (U-06): Backfill jira_account_id on native users who were already in the org
  // before this migration run. The bulk upsert above handles filteredUsers, but when
  // selectedMemberIds filters out some Jira users, native users with matching emails
  // never receive their jira_account_id. Run a bulk UPDATE against ALL Jira users
  // (not just filteredUsers) to fill the gap.
  //
  // Uses unnest($1::text[], $2::text[]) to avoid PostgreSQL's "could not determine
  // data type of parameter $N" error that occurs with VALUES-derived tables.
  {
    const backfillEmails: string[] = [];
    const backfillAccountIds: string[] = [];
    for (const u of users) {
      if (!u.emailAddress || !u.accountId) continue;
      backfillEmails.push(u.emailAddress.toLowerCase());
      backfillAccountIds.push(u.accountId);
    }
    if (backfillEmails.length > 0) {
      await client.query(
        `UPDATE users u
            SET jira_account_id = v.account_id,
                updated_at      = NOW()
           FROM unnest($1::text[], $2::text[]) AS v(email, account_id)
          WHERE u.email            = v.email
            AND u.jira_account_id IS NULL`,
        [backfillEmails, backfillAccountIds],
      ).catch((err: any) => {
        console.warn(`[Migration:${state.id}] jira_account_id backfill: ${err.message}`);
      });
      console.log(`[Migration:${state.id}] jira_account_id backfill attempted for ${backfillEmails.length} Jira users`);
    }
  }

  // W-4 (U-15): Sync email changes — when a Jira user changed their email after the
  // last migration, our DB has a stale email. Find users by jira_account_id and update
  // their email so lookup maps stay accurate.
  {
    const syncAccountIds: string[] = [];
    const syncEmails: string[] = [];
    for (const u of users) {
      if (!u.emailAddress || !u.accountId) continue;
      syncAccountIds.push(u.accountId);
      syncEmails.push(u.emailAddress.toLowerCase());
    }
    if (syncAccountIds.length > 0) {
      await client.query(
        `UPDATE users u
            SET email      = v.new_email,
                updated_at = NOW()
           FROM unnest($1::text[], $2::text[]) AS v(account_id, new_email)
          WHERE u.jira_account_id = v.account_id
            AND u.email           != v.new_email`,
        [syncAccountIds, syncEmails],
      ).catch((err: any) => {
        console.warn(`[Migration:${state.id}] email sync: ${err.message}`);
      });
    }
  }

  // Reload ALL org users into lookup maps — covers the case where selectedMemberIds=[]
  // caused filteredUsers to be empty (no upserts ran) but existing DB users must still
  // be available for Phase 4 assignee/reporter resolution.
  //
  // We query via organization_members (not users.organization_id) so that users whose
  // primary tenant differs from this org (e.g. migrated from another workspace and then
  // added as members) are still included in the accountId / email lookup maps.
  try {
    const { rows: existingUsers } = await client.query<{ id: string; email: string; jira_account_id: string | null }>(
      `SELECT DISTINCT u.id, u.email, u.jira_account_id
       FROM users u
       WHERE u.organization_id = $1
          OR u.id IN (SELECT user_id FROM organization_members WHERE organization_id = $1)`,
      [state.organizationId],
    );
    for (const u of existingUsers) {
      state.jiraUserEmailToLocalId[u.email.toLowerCase()] = u.id;
      if (u.jira_account_id) state.jiraAccountIdToLocalId[u.jira_account_id] = u.id;
    }
    console.log(`[Migration:${state.id}] Loaded ${existingUsers.length} org users into lookup maps`);
  } catch (err: any) {
    console.warn(`[Migration:${state.id}] Failed to reload user maps from DB: ${err.message}`);
  }

  // Flush errorLog so any warnings/failures above are visible on the migration run.
  await updateRunProgress(client, state.id, {
    processedMembers: processed,
    completedPhase: PHASE_MEMBERS,
    errorLog: state.errorLog,
  }, io);

  const suffix =
    filterIds != null && filterIds.size > 0
      ? `${filterIds.size} selected out of ${users.length} total`
      : `${users.length} fetched, ${emailDuplicates} deduped, ${insertFailures} failed`;
  console.log(`[Migration:${state.id}] Phase 1 done — ${processed}/${dedupedRows.length} upserted (${suffix})`);
}

// ─── Phase 1b: Project Member Sync ────────────────────────────────────────────

async function runProjectMemberSyncPhase(
  client: PoolClient,
  state: RunState,
  io: IORedis | null,
): Promise<void> {
  console.log(`[Migration:${state.id}] Phase 1b — project member sync`);

  const { rows: projects } = await client.query<{ id: string; key: string }>(
    `SELECT id, key FROM projects WHERE organization_id = $1`,
    [state.organizationId],
  );

  if (projects.length === 0) {
    console.log(`[Migration:${state.id}] Phase 1b — no projects found, skipping`);
    return;
  }

  let totalAssigned = 0;
  let projectsProcessed = 0;

  for (const project of projects) {
    // Collect distinct local user IDs from assignee_id and reporter_id on issues
    const { rows: directUserRows } = await client.query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM (
         SELECT assignee_id as user_id FROM issues WHERE project_id = $1 AND organization_id = $2 AND assignee_id IS NOT NULL
         UNION
         SELECT reporter_id as user_id FROM issues WHERE project_id = $1 AND organization_id = $2 AND reporter_id IS NOT NULL
       ) combined
       JOIN users u ON u.id = combined.user_id AND u.organization_id = $2`,
      [project.id, state.organizationId],
    ).catch(() => ({ rows: [] as any[] }));

    const userIds = directUserRows.map((r) => r.user_id).filter(Boolean);

    if (userIds.length === 0) {
      projectsProcessed++;
      continue;
    }

    for (const userId of userIds) {
      // Always use 'member' as the project role — users.role is a system-level
      // role (admin/manager/member/viewer) and must not bleed into project membership.
      await client.query(
        `INSERT INTO project_members (id, project_id, user_id, role, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'member', NOW())
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [project.id, userId],
      ).catch((err: any) => {
        addError(state, `project_member_sync: project ${project.key} user ${userId}: ${err.message}`);
      });

      totalAssigned++;
    }

    projectsProcessed++;

    await updateRunProgress(client, state.id, {
      currentPhase: PHASE_PROJECT_MEMBER_SYNC,
      processedProjects: projectsProcessed,
      totalProjects: projects.length,
    }, io);
  }

  console.log(`[Migration:${state.id}] Phase 1b done — ${totalAssigned} memberships across ${projectsProcessed} projects`);
}

// ─── Phase 2: Projects ────────────────────────────────────────────────────────

/**
 * Maps a Jira status category name to our internal category enum value.
 * Jira categories: "To Do", "In Progress", "Done" (statusCategory.name),
 * or we fall back to matching on the status name itself.
 *
 * BUG FIX: Check Jira's authoritative category FIRST. Only fall back to
 * keyword heuristics on the user-mapped name when the native category is
 * unknown/missing. Previously the keyword check ran first, causing names
 * like "Done Review" to match 'review' → 'in_progress' instead of Jira's
 * own 'done' category.
 */
function mapJiraStatusCategory(
  statusName: string,
  jiraCategoryName: string,
  statusMapping: Record<string, string>,
): 'todo' | 'in_progress' | 'done' {
  // 1. Check Jira's native category first — it is authoritative
  const cat = jiraCategoryName.toLowerCase();
  if (cat === 'in progress') return 'in_progress';
  if (cat === 'done') return 'done';
  if (cat === 'to do') return 'todo';

  // 2. Fall back to keyword heuristics on the (possibly user-mapped) name
  //    only when Jira's category is unknown/missing
  const mapped = (statusMapping[statusName] ?? statusName).toLowerCase();
  if (mapped.includes('progress') || mapped.includes('review') || mapped.includes('testing')) {
    return 'in_progress';
  }
  if (
    mapped.includes('done') || mapped.includes('complete') || mapped.includes('closed') ||
    mapped.includes('resolved') || mapped.includes('fixed') || mapped.includes('released')
  ) {
    return 'done';
  }
  return 'todo';
}

const STATUS_CATEGORY_COLORS: Record<'todo' | 'in_progress' | 'done', string> = {
  todo: '#6B7280',
  in_progress: '#3B82F6',
  done: '#10B981',
};

/** Project color palette — cycle through these for migrated projects */
const PROJECT_COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444'];

async function runProjectsPhase(
  client: PoolClient,
  state: RunState,
  credentials: JiraCredentials,
  io: IORedis | null,
): Promise<void> {
  console.log(`[Migration:${state.id}] Phase 2 — projects`);

  await updateRunProgress(client, state.id, {
    status: 'processing',
    currentPhase: PHASE_PROJECTS,
  }, io);

  const selectedKeys = new Set((state.selectedProjects ?? []).map((p) => p.key));
  let processedProjects = 0;
  let colorIdx = 0;

  for (const proj of state.selectedProjects ?? []) {
    if (!selectedKeys.has(proj.key)) continue;
    try {
      const projectColor = PROJECT_COLORS[colorIdx % PROJECT_COLORS.length];
      colorIdx++;

      // Upsert project using a safe two-step pattern that avoids PostgreSQL type-inference
      // failures that occur with ON CONFLICT DO UPDATE + COALESCE on parameterized queries.
      // Step 1: Try INSERT — ignore conflict.
      // Step 2: Always SELECT to get the authoritative id.
      // Step 3: Patch name/color on the existing row if needed.
      let projectId: string | undefined;

      // Step 1 — INSERT (ignore conflict on org+key)
      await client.query(
        `INSERT INTO projects (id, name, key, description, organization_id, owner_id, type, color, jira_project_key, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, '', $3, $4, 'scrum', $5, $2, NOW(), NOW())
         ON CONFLICT (organization_id, key) DO NOTHING`,
        [proj.name || proj.key, proj.key, state.organizationId, state.triggeredById, projectColor],
      ).catch((err: any) => addError(state, `project insert ${proj.key}: ${err.message}`));

      // Step 2 — SELECT the row (works whether just inserted or already existed)
      const { rows: lookupRows } = await client.query<{ id: string }>(
        `SELECT id FROM projects WHERE organization_id = $1 AND key = $2 LIMIT 1`,
        [state.organizationId, proj.key],
      ).catch(() => ({ rows: [] as Array<{ id: string }> }));
      projectId = lookupRows[0]?.id;

      if (!projectId) {
        addError(state, `project ${proj.key}: could not create or find project — skipping`);
        continue;
      }

      // Step 3 — Patch name, color, status, and jira_project_key on the existing row.
      // Always reset status to 'active' so previously-archived projects become visible again.
      // Set jira_project_key so native projects that were merged with a Jira project get tagged.
      await client.query(
        `UPDATE projects
            SET name             = $1,
                color            = COALESCE(color, $2::varchar),
                status           = 'active',
                jira_project_key = $4,
                updated_at       = NOW()
          WHERE id = $3::uuid`,
        [proj.name || proj.key, projectColor, projectId, proj.key],
      ).catch((err: any) => addError(state, `project patch ${proj.key}: ${err.message}`));

      // Step 4 — Ensure the migration owner is a project member so they can see it.
      // Non-admin users are shown only projects where they have a project_members row.
      // project_members schema: id, project_id, user_id, role, role_id (nullable), created_at
      await client.query(
        `INSERT INTO project_members (id, project_id, user_id, role, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'admin', NOW())
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [projectId, state.triggeredById],
      ).catch((err: any) => addError(state, `project member insert ${proj.key}: ${err.message}`));

      // ── Fetch Jira project role members and add only them as project_members ──
      // This mirrors Jira's actual project membership — only users assigned to a
      // role in this specific Jira project get a project_members row.
      // The migration owner's admin row (inserted above) is preserved via ON CONFLICT DO NOTHING.
      {
        const projectMemberRoles = new Map<string, 'admin' | 'member'>();
        const ADMIN_ROLE_KEYWORDS = ['administrator', 'lead', 'owner'];

        try {
          // GET /rest/api/3/project/{key}/role → { "Administrators": "https://.../10002", ... }
          const roleIndex = await jiraGet<Record<string, string>>(
            credentials,
            `/rest/api/3/project/${proj.key}/role`,
          ).catch(() => null as Record<string, string> | null);

          if (roleIndex && typeof roleIndex === 'object') {
            for (const [roleName, roleUrl] of Object.entries(roleIndex)) {
              const roleIdMatch = String(roleUrl).match(/\/(\d+)$/);
              if (!roleIdMatch) continue;
              const roleId = roleIdMatch[1];
              const isAdminRole = ADMIN_ROLE_KEYWORDS.some((kw) =>
                roleName.toLowerCase().includes(kw),
              );

              interface JiraRoleDetail {
                actors: Array<{ accountId?: string; type: string }>;
              }
              const roleDetail = await jiraGet<JiraRoleDetail>(
                credentials,
                `/rest/api/3/project/${proj.key}/role/${roleId}`,
              ).catch(() => null as JiraRoleDetail | null);

              for (const actor of roleDetail?.actors ?? []) {
                if (actor.type !== 'atlassian-user-role-actor' || !actor.accountId) continue;
                const localUserId = state.jiraAccountIdToLocalId[actor.accountId];
                if (!localUserId) continue;
                // Admin role wins if user appears in multiple roles
                if (isAdminRole || !projectMemberRoles.has(localUserId)) {
                  projectMemberRoles.set(localUserId, isAdminRole ? 'admin' : 'member');
                }
              }

              await delay(REQUEST_DELAY_MS);
            }
          }
        } catch (err: any) {
          addError(state, `project role members fetch ${proj.key}: ${err.message}`);
        }

        // Batch-insert only the Jira-sourced project members (skip triggeredById — already inserted above)
        if (projectMemberRoles.size > 0) {
          const entries = Array.from(projectMemberRoles.entries()).filter(
            ([userId]) => userId !== state.triggeredById,
          );
          if (entries.length > 0) {
            const pmPlaceholders: string[] = [];
            const pmParams: unknown[] = [];
            entries.forEach(([userId, role], idx) => {
              const b = idx * 3;
              pmPlaceholders.push(
                `(gen_random_uuid(), $${b + 1}::uuid, $${b + 2}::uuid, $${b + 3}::text, NOW())`,
              );
              pmParams.push(projectId, userId, role);
            });
            await client.query(
              `INSERT INTO project_members (id, project_id, user_id, role, created_at)
               VALUES ${pmPlaceholders.join(', ')}
               ON CONFLICT (project_id, user_id) DO NOTHING`,
              pmParams,
            ).catch((err: any) => addError(state, `project members insert ${proj.key}: ${err.message}`));
          }
        }
      }

      state.jiraProjectIdToLocalId[proj.key] = projectId;

      // ── Fetch real Jira statuses for this project ────────────────────────────
      // GET /rest/api/3/project/{projectKey}/statuses returns an array of issue
      // type objects, each with a `statuses` array. We deduplicate by status id.
      interface JiraStatusEntry {
        id: string;
        name: string;
        statusCategory: { name: string };
      }
      interface JiraIssueTypeStatuses {
        statuses: JiraStatusEntry[];
      }

      let jiraStatuses: JiraStatusEntry[] = [];
      try {
        const issueTypeStatuses = await jiraGet<JiraIssueTypeStatuses[]>(
          credentials,
          `/rest/api/3/project/${proj.key}/statuses`,
        );
        // Deduplicate by Jira status id — different issue types share statuses
        const seen = new Set<string>();
        for (const issueType of issueTypeStatuses ?? []) {
          for (const s of issueType.statuses ?? []) {
            if (!seen.has(s.id)) {
              seen.add(s.id);
              jiraStatuses.push(s);
            }
          }
        }
      } catch (err: any) {
        addError(state, `statuses fetch for ${proj.key}: ${err.message} — falling back to defaults`);
      }

      // Fall back to sensible defaults when Jira API returned nothing
      if (jiraStatuses.length === 0) {
        jiraStatuses = [
          { id: 'todo', name: 'To Do', statusCategory: { name: 'To Do' } },
          { id: 'inprogress', name: 'In Progress', statusCategory: { name: 'In Progress' } },
          { id: 'done', name: 'Done', statusCategory: { name: 'Done' } },
        ];
      }

      // Sort: todo → in_progress → done so positions are stable
      const ORDER: Record<'todo' | 'in_progress' | 'done', number> = { todo: 0, in_progress: 1, done: 2 };
      const statusMapping = state.statusMapping ?? {};
      jiraStatuses.sort((a, b) => {
        const catA = mapJiraStatusCategory(a.name, a.statusCategory.name, statusMapping);
        const catB = mapJiraStatusCategory(b.name, b.statusCategory.name, statusMapping);
        return ORDER[catA] - ORDER[catB];
      });

      // ── Upsert issue_statuses rows ───────────────────────────────────────────
      // There is NO unique constraint on (project_id, name) — must use WHERE NOT EXISTS.
      state.projectStatusMap[projectId] = {};
      let position = 0;
      for (const jiraStatus of jiraStatuses) {
        const displayName = (statusMapping[jiraStatus.name] ?? jiraStatus.name).trim();
        const category = mapJiraStatusCategory(jiraStatus.name, jiraStatus.statusCategory.name, statusMapping);
        const color = STATUS_CATEGORY_COLORS[category];

        const { rows: statusRows } = await client.query<{ id: string }>(
          `INSERT INTO issue_statuses (id, name, category, color, position, project_id, created_at, updated_at)
           SELECT gen_random_uuid(), $1::varchar, $2::varchar, $3::varchar, $4::int, $5::uuid, NOW(), NOW()
           WHERE NOT EXISTS (
             SELECT 1 FROM issue_statuses WHERE project_id = $5::uuid AND name = $1::varchar
           )
           RETURNING id`,
          [displayName, category, color, position, projectId],
        );

        let statusId: string;
        if (statusRows[0]) {
          statusId = statusRows[0].id;
        } else {
          // Row already existed — look it up
          const { rows: existing } = await client.query<{ id: string }>(
            `SELECT id FROM issue_statuses WHERE project_id = $1 AND name = $2 LIMIT 1`,
            [projectId, displayName],
          );
          statusId = existing[0]?.id ?? '';
        }

        if (statusId) {
          // Map both the original Jira name AND the display name so issue lookup works either way
          state.projectStatusMap[projectId][jiraStatus.name] = statusId;
          state.projectStatusMap[projectId][displayName] = statusId;
        }
        position++;
      }

      console.log(
        `[Migration:${state.id}] Project ${proj.key} — created ${jiraStatuses.length} statuses: ` +
        jiraStatuses.map((s) => s.name).join(', '),
      );
      processedProjects++;
    } catch (err: any) {
      addError(state, `project ${proj.key}: ${err.message}`);
    }
  }

  await updateRunProgress(client, state.id, {
    processedProjects,
    completedPhase: PHASE_PROJECTS,
  }, io);

  console.log(`[Migration:${state.id}] Phase 2 done — ${processedProjects} projects`);
}

// ─── Phase 3: Sprints ─────────────────────────────────────────────────────────

async function runSprintsPhase(
  client: PoolClient,
  state: RunState,
  credentials: JiraCredentials,
  io: IORedis | null,
): Promise<void> {
  console.log(`[Migration:${state.id}] Phase 3 — sprints`);

  await updateRunProgress(client, state.id, {
    status: 'processing',
    currentPhase: PHASE_SPRINTS,
  }, io);

  let totalSprints = 0;
  let processedSprints = 0;

  for (const proj of state.selectedProjects ?? []) {
    const projectId = state.jiraProjectIdToLocalId[proj.key];
    if (!projectId) continue;

    try {
      // Find board for this project
      // Fetch ALL boards for this project (a project can have multiple boards).
      // Log any error — previously this was silently swallowed causing 0/0 sprints.
      let boardValues: Array<{ id: number; name: string }> = [];
      try {
        const boardsResp = await jiraGet<{ values: Array<{ id: number; name: string }> }>(
          credentials,
          `/rest/agile/1.0/board?projectKeyOrId=${proj.key}&maxResults=50`,
        );
        boardValues = boardsResp?.values ?? [];
      } catch (err: any) {
        // 401 "scope does not match" means the OAuth token lacks read:board-scope:jira-software.
        // This is non-fatal — phase 4 extracts sprint data from customfield_10020 on each issue.
        // Do NOT call addError() here; that would show a red error in the UI for a graceful fallback.
        const is401 = String(err.message).includes('401');
        console.warn(`[Migration:${state.id}] Boards API ${is401 ? '401 (agile scope missing)' : 'error'} for ${proj.key}: ${err.message} — sprints will be extracted from issue fields in Phase 4`);
        continue;
      }

      if (boardValues.length === 0) {
        console.log(`[Migration:${state.id}] No boards found for project ${proj.key} — no sprints to import`);
        continue;
      }

      // Collect sprints across ALL boards for this project (deduplicate by sprint id)
      const seenSprintIds = new Set<number>();

      // Paginate through ALL sprints across ALL boards for this project.
      // Jira Agile API default page size is 50; boards with many sprints need pagination.
      const SPRINT_PAGE = 50;
      const allSprints: Array<{
        id: number; name: string; state: string;
        startDate?: string; endDate?: string; goal?: string;
      }> = [];

      for (const board of boardValues) {
        let sprintStart = 0;
        let sprintHasMore = true;
        while (sprintHasMore) {
          let sprintsResp: { values: typeof allSprints; isLast?: boolean };
          try {
            sprintsResp = await jiraGet<{ values: typeof allSprints; isLast?: boolean }>(
              credentials,
              `/rest/agile/1.0/board/${board.id}/sprint?startAt=${sprintStart}&maxResults=${SPRINT_PAGE}`,
            );
          } catch (err: any) {
            console.warn(`[Migration:${state.id}] Sprint fetch error board ${board.id}: ${err.message}`);
            addError(state, `sprint fetch board ${board.id}: ${err.message}`);
            break;
          }

          const page = sprintsResp?.values ?? [];
          // Deduplicate sprints that appear on multiple boards
          for (const s of page) {
            if (!seenSprintIds.has(s.id)) {
              seenSprintIds.add(s.id);
              allSprints.push(s);
            }
          }

          // isLast=true signals final page; also stop if page returned fewer than requested
          sprintHasMore = !sprintsResp?.isLast && page.length === SPRINT_PAGE;
          sprintStart += SPRINT_PAGE;
        }
      }

      const sprints = allSprints;
      console.log(`[Migration:${state.id}] Project ${proj.key}: found ${boardValues.length} board(s), ${sprints.length} sprint(s)`);
      totalSprints += sprints.length;

      for (const sprint of sprints) {
        try {
          const sprintStatus = sprint.state === 'active' ? 'active' : sprint.state === 'closed' ? 'completed' : 'planned';
          const completedAt = sprintStatus === 'completed'
            ? (sprint.endDate ?? 'NOW()')
            : null;
          const sprintParams = [
            sprint.id,   // $1 jira_sprint_id (int)
            sprintStatus,
            sprint.goal ?? null,
            sprint.startDate ? sprint.startDate.substring(0, 10) : null,
            sprint.endDate ? sprint.endDate.substring(0, 10) : null,
            completedAt,
            projectId,
            sprint.name,
          ];

          // Step A: backfill legacy rows (no jira_sprint_id) matched by name, updating
          // all metadata so a re-migration after archive refreshes sprint state/dates.
          const { rows: backfilled } = await client.query<{ id: string }>(
            `UPDATE sprints
                SET jira_sprint_id = $1::int,
                    status         = $2::text,
                    goal           = $3::text,
                    start_date     = $4::date,
                    end_date       = $5::date,
                    completed_at   = $6::timestamp,
                    updated_at     = NOW()
              WHERE project_id    = $7::uuid
                AND name          = $8::text
                AND jira_sprint_id IS NULL
              RETURNING id`,
            sprintParams,
          );

          let sprintLocalId: string | undefined = backfilled[0]?.id;

          if (!sprintLocalId) {
            // Step B: true upsert by jira_sprint_id — covers first import (INSERT) and
            // subsequent re-migrations (ON CONFLICT → DO UPDATE refreshes metadata).
            const { rows } = await client.query<{ id: string }>(
              `INSERT INTO sprints (id, name, status, goal, start_date, end_date, completed_at, project_id, jira_sprint_id, created_at, updated_at)
               VALUES (gen_random_uuid(), $8::text, $2::text, $3::text, $4::date, $5::date, $6::timestamp, $7::uuid, $1::int, NOW(), NOW())
               ON CONFLICT (project_id, jira_sprint_id) WHERE jira_sprint_id IS NOT NULL DO UPDATE SET
                 name         = EXCLUDED.name,
                 status       = EXCLUDED.status,
                 goal         = EXCLUDED.goal,
                 start_date   = EXCLUDED.start_date,
                 end_date     = EXCLUDED.end_date,
                 completed_at = EXCLUDED.completed_at,
                 updated_at   = NOW()
               RETURNING id`,
              sprintParams,
            );
            sprintLocalId = rows[0]?.id;
          }

          if (sprintLocalId) {
            state.jiraSprintIdToLocalId[String(sprint.id)] = sprintLocalId;
            processedSprints++;
          }
        } catch (err: any) {
          addError(state, `sprint ${sprint.name}: ${err.message}`);
        }
      }
    } catch (err: any) {
      addError(state, `sprints for ${proj.key}: ${err.message}`);
    }
  }

  await updateRunProgress(client, state.id, {
    totalSprints,
    processedSprints,
    completedPhase: PHASE_SPRINTS,
  }, io);

  console.log(`[Migration:${state.id}] Phase 3 done — ${processedSprints}/${totalSprints} sprints`);
}

// ─── Phase 4: Issues ──────────────────────────────────────────────────────────

async function runIssuesPhase(
  client: PoolClient,
  state: RunState,
  credentials: JiraCredentials,
  io: IORedis | null,
): Promise<void> {
  console.log(`[Migration:${state.id}] Phase 4 — issues`);

  await updateRunProgress(client, state.id, {
    status: 'processing',
    currentPhase: PHASE_ISSUES,
    totalIssues: 0,
    processedIssues: 0,
    failedIssues: 0,
  }, io);

  const PAGE_SIZE = 100;
  // /rest/api/3/search was permanently removed (410). Must use /rest/api/3/search/jql.
  // This endpoint uses cursor-based pagination: pass nextPageToken from the previous
  // response until it is absent (last page). There is no `total` field — we count
  // processed issues as we go.
  const FIELDS = [
    'summary', 'description', 'issuetype', 'priority', 'status',
    'assignee', 'reporter', 'created', 'updated', 'duedate', 'labels',
    'customfield_10016', 'customfield_10020', 'timetracking',
    'subtasks', 'parent', 'issuelinks', 'comment',
    'attachment',
  ].join(',');

  // Initialize the pagination map — Phase 5 checks for its presence to detect resume.
  state.issuesNeedingCommentPagination = new Map<string, number>();

  let totalIssues = 0;
  let processedIssues = 0;
  let failedIssues = 0;
  // Count sprints created inline (Phase 3 may have been skipped due to 401 from Agile API).
  let inlineSprintsCreated = 0;
  // Running count of inline comments inserted/updated during Phase 4.
  // Passed to Phase 5 so the final counter update does not reset it to 0.
  let inlineCommentCount = 0;
  // Dedicated issue error log — never evicted by comment errors in the shared 100-slot ring buffer.
  const issueErrors: string[] = [];

  // Accumulated across all projects for the post-import pass
  const parentMap: Record<string, string> = {};         // jiraKey → parentJiraKey
  const issueLinkAccum: Array<{ sourceKey: string; links: any[] }> = [];

  for (const proj of state.selectedProjects ?? []) {
    const projectId = state.jiraProjectIdToLocalId[proj.key];
    if (!projectId) continue;

    // Reload the per-project status map in case Phase 2 was already completed
    // (resume path) and projectStatusMap is empty.
    if (!state.projectStatusMap[projectId] || Object.keys(state.projectStatusMap[projectId]).length === 0) {
      const { rows: statusRows } = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM issue_statuses WHERE project_id = $1`,
        [projectId],
      );
      state.projectStatusMap[projectId] = {};
      for (const r of statusRows) {
        state.projectStatusMap[projectId][r.name] = r.id;
      }
    }

    const jql = `project = "${proj.key}" ORDER BY created ASC`;
    // Cursor-based pagination — nextPageToken absent means last page reached.
    let nextPageToken: string | undefined = undefined;
    let hasMore = true;
    let pageNumber = 0;
    let projectIssueCount = 0;

    while (hasMore) {
      const params = new URLSearchParams({
        jql,
        maxResults: String(PAGE_SIZE),
        fields: FIELDS,
      });
      if (nextPageToken) params.set('nextPageToken', nextPageToken);

      let page: { issues: any[]; nextPageToken?: string };
      try {
        page = await jiraGet<{ issues: any[]; nextPageToken?: string }>(
          credentials,
          `/rest/api/3/search/jql?${params.toString()}`,
        );
      } catch (err: any) {
        addError(state, `issues page ${proj.key}@${pageNumber * PAGE_SIZE}: ${err.message}`);
        break;
      }
      pageNumber++;

      // ── Bulk-upsert new sprints encountered in this page ─────────────────────
      // Collect unique new sprints (by Jira sprint id) before inserting issues.
      // If Phase 3 (Agile API) failed due to missing OAuth scope, we create sprints
      // here on-the-fly from the issue's own sprint field data — no extra scope needed.
      const newSprintsById = new Map<string, {
        name: string; state: string; goal?: string;
        startDate?: string; endDate?: string;
      }>();
      for (const issue of page.issues ?? []) {
        const sprintArr = Array.isArray(issue.fields?.customfield_10020) ? issue.fields.customfield_10020 : [];
        for (const sp of sprintArr) {
          const key = String(sp.id);
          if (!state.jiraSprintIdToLocalId[key] && !newSprintsById.has(key)) {
            newSprintsById.set(key, sp);
          }
        }
      }

      if (newSprintsById.size > 0) {
        const sprintEntries = [...newSprintsById.entries()];

        // ── Step A: backfill legacy rows (jira_sprint_id IS NULL) matched by name ──
        // Handles the transition from the old name-dedup approach; also updates
        // sprint metadata (status/dates) so re-migration after archive reflects
        // the current Jira state.
        const bfPlaceholders: string[] = [];
        const bfParams: unknown[] = [projectId];
        sprintEntries.forEach(([jiraId, sp], j) => {
          const b = j * 2 + 2;
          bfPlaceholders.push(`($${b}::int, $${b+1}::text)`);
          bfParams.push(Number(jiraId), sp.name);
        });

        const { rows: backfilled } = await client.query<{ id: string; jira_sprint_id: number }>(
          `UPDATE sprints s
              SET jira_sprint_id = v.jira_sprint_id
             FROM (VALUES ${bfPlaceholders.join(', ')}) AS v(jira_sprint_id, name)
            WHERE s.project_id    = $1::uuid
              AND s.name          = v.name
              AND s.jira_sprint_id IS NULL
           RETURNING s.id, s.jira_sprint_id`,
          bfParams,
        ).catch(() => ({ rows: [] as any[] }));

        const backfilledJiraIds = new Set<string>();
        for (const r of backfilled) {
          const jiraId = String(r.jira_sprint_id);
          state.jiraSprintIdToLocalId[jiraId] = r.id;
          backfilledJiraIds.add(jiraId);
        }

        // ── Step B: upsert remaining sprints by jira_sprint_id ───────────────────
        // Covers first import (INSERT new row) and re-migrations where jira_sprint_id
        // is already set (ON CONFLICT → DO UPDATE refreshes status/dates/goal).
        const remainingEntries = sprintEntries.filter(([jiraId]) => !backfilledJiraIds.has(jiraId));
        if (remainingEntries.length > 0) {
          const spPlaceholders: string[] = [];
          const spParams: unknown[] = [projectId];
          remainingEntries.forEach(([jiraId, sp], j) => {
            const b = j * 7 + 2;
            const spStatus = sp.state === 'active' ? 'active' : sp.state === 'closed' ? 'completed' : 'planned';
            const completedAt = spStatus === 'completed' ? (sp.endDate ? sp.endDate.substring(0, 10) : null) : null;
            spPlaceholders.push(`($${b}::int, $${b+1}::text, $${b+2}::text, $${b+3}::text, $${b+4}::date, $${b+5}::date, $${b+6}::timestamp)`);
            spParams.push(
              Number(jiraId), sp.name, spStatus, sp.goal ?? null,
              sp.startDate ? sp.startDate.substring(0, 10) : null,
              sp.endDate ? sp.endDate.substring(0, 10) : null,
              completedAt,
            );
          });

          const { rows: upsertedSprints } = await client.query<{ id: string; jira_sprint_id: number }>(
            `INSERT INTO sprints (id, name, status, goal, start_date, end_date, completed_at, project_id, jira_sprint_id, created_at, updated_at)
             SELECT gen_random_uuid(), v.name, v.status, v.goal, v.start_date, v.end_date, v.completed_at, $1::uuid, v.jira_sprint_id, NOW(), NOW()
             FROM (VALUES ${spPlaceholders.join(', ')}) AS v(jira_sprint_id, name, status, goal, start_date, end_date, completed_at)
             ON CONFLICT (project_id, jira_sprint_id) WHERE jira_sprint_id IS NOT NULL DO UPDATE SET
               name         = EXCLUDED.name,
               status       = EXCLUDED.status,
               goal         = EXCLUDED.goal,
               start_date   = EXCLUDED.start_date,
               end_date     = EXCLUDED.end_date,
               completed_at = EXCLUDED.completed_at,
               updated_at   = NOW()
             RETURNING id, jira_sprint_id`,
            spParams,
          ).catch((err: any) => { addError(state, `sprints bulk insert: ${err.message}`); return { rows: [] as any[] }; });

          for (const r of upsertedSprints) {
            state.jiraSprintIdToLocalId[String(r.jira_sprint_id)] = r.id;
          }
          inlineSprintsCreated += upsertedSprints.length;
        }
        inlineSprintsCreated += backfilled.length;
      }

      // ── Bulk-insert all issues in this page ──────────────────────────────────
      interface IssueRow {
        title: string; description: string | null; type: string; priority: string;
        statusId: string | null; assigneeId: string | null; reporterId: string;
        sprintId: string | null; jiraKey: string; jiraNum: number;
        labels: string[]; storyPoints: number | null;
        timeEstimate: number | null; timeSpent: number;
        createdAt: string | null; updatedAt: string | null;
        dueDate: string | null;
      }

      const issueRowsToInsert: IssueRow[] = [];

      for (const issue of page.issues ?? []) {
        try {
          const fields = issue.fields ?? {};
          const type = mapIssueType(fields.issuetype?.name);
          const priority = mapPriority(fields.priority?.name);

          const jiraStatusName = fields.status?.name ?? 'To Do';
          const projectStatuses = state.projectStatusMap[projectId] ?? {};
          const statusMapping = state.statusMapping ?? {};
          const mappedStatusName = (statusMapping[jiraStatusName] ?? jiraStatusName).trim();
          // Level 1: exact name match (Jira name or user-mapped name)
          let statusId = projectStatuses[jiraStatusName] ?? projectStatuses[mappedStatusName] ?? null;
          if (!statusId) {
            // Level 2: any 'todo' category status for this project
            const { rows: fallbackRows } = await client.query<{ id: string }>(
              `SELECT id FROM issue_statuses WHERE project_id = $1 AND category = 'todo' ORDER BY position LIMIT 1`,
              [projectId],
            );
            statusId = fallbackRows[0]?.id ?? null;
          }
          if (!statusId) {
            // Level 3: any status for this project (catch-all)
            const { rows: anyStatusRows } = await client.query<{ id: string }>(
              `SELECT id FROM issue_statuses WHERE project_id = $1 ORDER BY position LIMIT 1`,
              [projectId],
            );
            statusId = anyStatusRows[0]?.id ?? null;
          }
          if (!statusId) {
            // Level 4: no statuses at all for this project — skip the issue and log loudly
            addError(state, `issue ${issue.key}: no statuses found for project ${projectId} — skipping`);
            failedIssues++;
            continue;
          }

          const assigneeAccountId = fields.assignee?.accountId;
          const reporterAccountId = fields.reporter?.accountId;
          const assigneeEmail = fields.assignee?.emailAddress?.toLowerCase();
          const reporterEmail = fields.reporter?.emailAddress?.toLowerCase();

          // Look up by accountId first (works even when Jira hides the email).
          // Fall back to email lookup for pre-Cloud instances that exposed emails.
          const assigneeId = (assigneeAccountId && state.jiraAccountIdToLocalId[assigneeAccountId])
            ?? (assigneeEmail && state.jiraUserEmailToLocalId[assigneeEmail])
            ?? null;
          const reporterId = (reporterAccountId && state.jiraAccountIdToLocalId[reporterAccountId])
            ?? (reporterEmail && state.jiraUserEmailToLocalId[reporterEmail])
            ?? null;

          // Sprint — already created in bulk above
          let sprintId: string | null = null;
          const sprintArr = Array.isArray(fields.customfield_10020) ? fields.customfield_10020 : [];
          const activeSprint = sprintArr.find((s: any) => s.state === 'active') ?? sprintArr[0];
          if (activeSprint) sprintId = state.jiraSprintIdToLocalId[String(activeSprint.id)] ?? null;

          const issueNumber = parseInt(issue.key.split('-').pop() ?? '0', 10) || 0;
          const safeReporterId = reporterId ?? state.triggeredById;

          if (fields.parent?.key) parentMap[issue.key] = fields.parent.key;
          if (Array.isArray(fields.issuelinks) && fields.issuelinks.length > 0) {
            issueLinkAccum.push({ sourceKey: issue.key, links: fields.issuelinks });
          }

          // Map due date: use Jira's duedate if present, otherwise fall back to
          // createdAt + storyPoints days (1 SP = 1 day) or createdAt + 7 days.
          // This ensures every migrated issue has a dueDate and appears on the Timeline.
          let dueDate: string | null = null;
          if (fields.duedate) {
            // Jira duedate is already a date string e.g. "2024-03-15"
            dueDate = fields.duedate.substring(0, 10);
          } else {
            const storyPts = fields.customfield_10016 ?? null;
            const fallbackDays = storyPts && storyPts > 0 ? Math.ceil(storyPts) : 7;
            const baseDate = fields.created ? new Date(fields.created) : new Date();
            const dueMs = baseDate.getTime() + fallbackDays * 24 * 60 * 60 * 1000;
            dueDate = new Date(dueMs).toISOString().substring(0, 10);
          }

          const attachmentMap = new Map<string, string>();
          for (const att of (fields.attachment ?? []) as JiraApiAttachment[]) {
            attachmentMap.set(att.id, att.filename);
          }

          issueRowsToInsert.push({
            title: fields.summary ?? issue.key,
            description: extractDescription(fields.description, attachmentMap),
            type, priority, statusId, assigneeId,
            reporterId: safeReporterId,
            sprintId, jiraKey: issue.key, jiraNum: issueNumber,
            labels: Array.isArray(fields.labels) ? fields.labels : [],
            storyPoints: fields.customfield_10016 ?? null,
            timeEstimate: fields.timetracking?.originalEstimateSeconds ?? null,
            timeSpent: fields.timetracking?.timeSpentSeconds ?? 0,
            createdAt: fields.created ?? null,
            updatedAt: fields.updated ?? null,
            dueDate,
          });
        } catch (err: any) {
          addError(state, `issue ${issue.key}: ${err.message}`);
          failedIssues++;
        }
      }

      // One bulk INSERT for all issues in this page
      if (issueRowsToInsert.length > 0) {
        const valPlaceholders: string[] = [];
        const valParams: unknown[] = [projectId, state.organizationId];
        let pIdx = 3;

        for (const r of issueRowsToInsert) {
          valPlaceholders.push(
            `(gen_random_uuid(), $${pIdx}::text, $${pIdx+1}::text, $${pIdx+2}::text, $${pIdx+3}::text, ` +
            `$${pIdx+4}::uuid, $${pIdx+5}::uuid, $${pIdx+6}::uuid, $${pIdx+7}::uuid, $${pIdx+8}::text, ` +
            `$${pIdx+9}::text[], $${pIdx+10}::numeric, $${pIdx+11}::int, $${pIdx+12}::int, ` +
            `COALESCE($${pIdx+13}::timestamptz, NOW()), COALESCE($${pIdx+14}::timestamptz, NOW()), ` +
            `$${pIdx+15}::date)`,
          );
          valParams.push(
            r.title, r.description, r.type, r.priority,
            r.statusId, r.assigneeId, r.reporterId, r.sprintId,
            r.jiraKey,
            r.labels, r.storyPoints, r.timeEstimate, r.timeSpent,
            r.createdAt, r.updatedAt, r.dueDate,
          );
          pIdx += 16;
        }

        // CTE assigns safe issue numbers: use Jira number if free, otherwise max+rn.
        // ON CONFLICT DO UPDATE makes this a true upsert — re-runs update existing issues
        // and RETURNING returns ALL rows (new inserts + updates), so no existingKeys
        // lookup is needed.
        const issueCteQuery = `WITH max_num AS (
             SELECT COALESCE(MAX(number), 0) AS n FROM issues WHERE project_id = $1
           ),
           incoming AS (
             SELECT v.*, ROW_NUMBER() OVER (ORDER BY v.jira_key) AS rn
             FROM (VALUES ${valPlaceholders.join(', ')}) AS v(
               id, title, description, type, priority,
               status_id, assignee_id, reporter_id, sprint_id,
               jira_key, labels, story_points, time_estimate, time_spent,
               created_at, updated_at, due_date
             )
           )
           INSERT INTO issues (
             id, title, description, type, priority,
             status_id, project_id, organization_id,
             assignee_id, reporter_id, sprint_id,
             key, number, jira_key, labels, story_points,
             time_estimate, time_spent, created_at, updated_at, due_date
           )
           SELECT
             i.id, i.title, i.description, i.type, i.priority,
             i.status_id, $1::uuid, $2::uuid,
             i.assignee_id, i.reporter_id, i.sprint_id,
             i.jira_key,
             CASE WHEN NOT EXISTS (
               SELECT 1 FROM issues WHERE project_id = $1 AND number = i.jira_key_num
             ) THEN i.jira_key_num
             ELSE (SELECT n FROM max_num) + i.rn
             END,
             i.jira_key, i.labels, i.story_points,
             i.time_estimate, i.time_spent, i.created_at, i.updated_at, i.due_date
           FROM (
             SELECT *,
               (regexp_match(jira_key, '\\d+$'))[1]::int AS jira_key_num
             FROM incoming
           ) i
           ON CONFLICT (project_id, jira_key) WHERE jira_key IS NOT NULL DO UPDATE SET
             title         = CASE WHEN 'title'         = ANY(issues.locked_fields) THEN issues.title         ELSE EXCLUDED.title         END,
             description   = CASE WHEN 'description'   = ANY(issues.locked_fields) THEN issues.description   ELSE EXCLUDED.description   END,
             type          = CASE WHEN 'type'           = ANY(issues.locked_fields) THEN issues.type           ELSE EXCLUDED.type           END,
             priority      = CASE WHEN 'priority'       = ANY(issues.locked_fields) THEN issues.priority       ELSE EXCLUDED.priority       END,
             status_id     = CASE WHEN 'status_id'      = ANY(issues.locked_fields) THEN issues.status_id      ELSE EXCLUDED.status_id      END,
             assignee_id   = CASE WHEN 'assignee_id'    = ANY(issues.locked_fields) THEN issues.assignee_id    ELSE EXCLUDED.assignee_id    END,
             reporter_id   = CASE WHEN 'reporter_id'    = ANY(issues.locked_fields) THEN issues.reporter_id    ELSE EXCLUDED.reporter_id    END,
             sprint_id     = CASE WHEN 'sprint_id'      = ANY(issues.locked_fields) THEN issues.sprint_id      ELSE EXCLUDED.sprint_id      END,
             labels        = CASE WHEN 'labels'         = ANY(issues.locked_fields) THEN issues.labels         ELSE EXCLUDED.labels         END,
             story_points  = CASE WHEN 'story_points'   = ANY(issues.locked_fields) THEN issues.story_points   ELSE EXCLUDED.story_points   END,
             time_estimate = CASE WHEN 'time_estimate'  = ANY(issues.locked_fields) THEN issues.time_estimate  ELSE EXCLUDED.time_estimate  END,
             time_spent    = EXCLUDED.time_spent,
             due_date      = CASE WHEN 'due_date'       = ANY(issues.locked_fields) THEN issues.due_date       ELSE EXCLUDED.due_date       END,
             updated_at    = EXCLUDED.updated_at,
             deleted_at    = NULL
           RETURNING id, jira_key`;

        let bulkInsertFailed = false;
        const { rows: insertedIssues } = await client.query<{ id: string; jira_key: string }>(
          issueCteQuery,
          valParams,
        ).catch((err: any) => {
          const errMsg = `issues bulk insert page ${proj.key}@page${pageNumber}: ${err.message}`;
          addError(state, errMsg);
          issueErrors.push(errMsg);
          console.error(`[Migration:${state.id}] ${errMsg}`);
          failedIssues += issueRowsToInsert.length;
          bulkInsertFailed = true;
          return { rows: [] as any[] };
        });

        // Fallback: if the page bulk INSERT failed, attempt individual single-row inserts
        // so issues are never silently skipped due to a transient page-level failure.
        if (bulkInsertFailed && issueRowsToInsert.length > 0) {
          for (const r of issueRowsToInsert) {
            try {
              const { rows: singleRows } = await client.query<{ id: string; jira_key: string }>(
                `WITH max_num AS (SELECT COALESCE(MAX(number), 0) AS n FROM issues WHERE project_id = $1)
                 INSERT INTO issues (
                   id, title, description, type, priority,
                   status_id, project_id, organization_id,
                   assignee_id, reporter_id, sprint_id,
                   key, number, jira_key, labels, story_points,
                   time_estimate, time_spent, created_at, updated_at, due_date
                 )
                 SELECT
                   gen_random_uuid(), $3::text, $4::text, $5::text, $6::text,
                   $7::uuid, $1::uuid, $2::uuid,
                   $8::uuid, $9::uuid, $10::uuid,
                   $11::text,
                   CASE WHEN NOT EXISTS (
                     SELECT 1 FROM issues WHERE project_id = $1 AND number = (regexp_match($11, '\\d+$'))[1]::int
                   ) THEN (regexp_match($11, '\\d+$'))[1]::int
                   ELSE (SELECT n FROM max_num) + 1
                   END,
                   $11::text, $12::text[], $13::numeric, $14::int, $15::int,
                   COALESCE($16::timestamptz, NOW()), COALESCE($17::timestamptz, NOW()), $18::date
                 ON CONFLICT (project_id, jira_key) WHERE jira_key IS NOT NULL DO UPDATE SET
                   title         = CASE WHEN 'title'         = ANY(issues.locked_fields) THEN issues.title         ELSE EXCLUDED.title         END,
                   description   = CASE WHEN 'description'   = ANY(issues.locked_fields) THEN issues.description   ELSE EXCLUDED.description   END,
                   type          = CASE WHEN 'type'           = ANY(issues.locked_fields) THEN issues.type           ELSE EXCLUDED.type           END,
                   priority      = CASE WHEN 'priority'       = ANY(issues.locked_fields) THEN issues.priority       ELSE EXCLUDED.priority       END,
                   status_id     = CASE WHEN 'status_id'      = ANY(issues.locked_fields) THEN issues.status_id      ELSE EXCLUDED.status_id      END,
                   assignee_id   = CASE WHEN 'assignee_id'    = ANY(issues.locked_fields) THEN issues.assignee_id    ELSE EXCLUDED.assignee_id    END,
                   reporter_id   = CASE WHEN 'reporter_id'    = ANY(issues.locked_fields) THEN issues.reporter_id    ELSE EXCLUDED.reporter_id    END,
                   sprint_id     = CASE WHEN 'sprint_id'      = ANY(issues.locked_fields) THEN issues.sprint_id      ELSE EXCLUDED.sprint_id      END,
                   labels        = CASE WHEN 'labels'         = ANY(issues.locked_fields) THEN issues.labels         ELSE EXCLUDED.labels         END,
                   story_points  = CASE WHEN 'story_points'   = ANY(issues.locked_fields) THEN issues.story_points   ELSE EXCLUDED.story_points   END,
                   time_estimate = CASE WHEN 'time_estimate'  = ANY(issues.locked_fields) THEN issues.time_estimate  ELSE EXCLUDED.time_estimate  END,
                   time_spent    = EXCLUDED.time_spent,
                   due_date      = CASE WHEN 'due_date'       = ANY(issues.locked_fields) THEN issues.due_date       ELSE EXCLUDED.due_date       END,
                   updated_at    = EXCLUDED.updated_at,
                   deleted_at    = NULL
                 RETURNING id, jira_key`,
                [
                  projectId, state.organizationId,
                  r.title, r.description, r.type, r.priority,
                  r.statusId, r.assigneeId, r.reporterId, r.sprintId,
                  r.jiraKey,
                  r.labels, r.storyPoints, r.timeEstimate, r.timeSpent,
                  r.createdAt, r.updatedAt, r.dueDate,
                ],
              );
              if (singleRows[0]) {
                state.jiraIssueKeyToLocalId[singleRows[0].jira_key] = singleRows[0].id;
                processedIssues++;
                projectIssueCount++;
                // This issue was counted as failed in the bulk attempt — correct the counter
                failedIssues = Math.max(0, failedIssues - 1);
              }
            } catch (singleErr: any) {
              const singleErrMsg = `issue fallback insert ${r.jiraKey}: ${singleErr.message}`;
              issueErrors.push(singleErrMsg);
              addError(state, singleErrMsg);
            }
          }
        }

        // Collect issue IDs upserted in this page so we can create timeline activities below.
        const pageUpsertedIds: string[] = [];

        if (!bulkInsertFailed) {
          // Normal path: ON CONFLICT DO UPDATE upsert — RETURNING gives ALL rows (new + updated).
          // No existingKeys lookup needed.
          for (const row of insertedIssues) {
            state.jiraIssueKeyToLocalId[row.jira_key] = row.id;
            pageUpsertedIds.push(row.id);
            processedIssues++;
            projectIssueCount++;
          }
        } else {
          // Fallback path: individual inserts already ran above and incremented processedIssues
          // for each successful upsert. Now populate jiraIssueKeyToLocalId for any issues
          // not yet mapped (were already in DB but the fallback INSERT also upserted them,
          // so they should be in the map — this is a safety net only).
          const unmappedKeys = issueRowsToInsert
            .map(r => r.jiraKey)
            .filter(k => !state.jiraIssueKeyToLocalId[k]);
          if (unmappedKeys.length > 0) {
            const { rows: preExisting } = await client.query<{ id: string; jira_key: string }>(
              `SELECT id, jira_key FROM issues WHERE project_id = $1 AND jira_key = ANY($2::text[])`,
              [projectId, unmappedKeys],
            ).catch(() => ({ rows: [] as any[] }));
            for (const row of preExisting) {
              // Populate map so comments phase works, but do NOT increment processedIssues —
              // these were already counted as failed and will stay that way.
              state.jiraIssueKeyToLocalId[row.jira_key] = row.id;
            }
          }
          // Collect all IDs that were successfully upserted in the fallback path
          for (const jiraKey of Object.keys(state.jiraIssueKeyToLocalId)) {
            if (issueRowsToInsert.some(r => r.jiraKey === jiraKey)) {
              const id = state.jiraIssueKeyToLocalId[jiraKey];
              if (id) pageUpsertedIds.push(id);
            }
          }
        }

        // ── Create timeline (activity) records for imported issues ──────────────
        // Use the issue's own reporter_id and created_at so the timeline reflects
        // the original Jira history. Idempotent: skips issues that already have a
        // 'created' activity (safe on re-import).
        if (pageUpsertedIds.length > 0) {
          await client.query(
            `INSERT INTO activities (id, organization_id, issue_id, user_id, action, metadata, created_at)
             SELECT
               gen_random_uuid(),
               $1::uuid,
               i.id,
               COALESCE(i.reporter_id, $2::uuid),
               'created',
               '{"importedFromJira": true}'::jsonb,
               i.created_at
             FROM issues i
             WHERE i.id = ANY($3::uuid[])
               AND NOT EXISTS (
                 SELECT 1 FROM activities a WHERE a.issue_id = i.id AND a.action = 'created'
               )`,
            [state.organizationId, state.triggeredById, pageUpsertedIds],
          ).catch((err: any) => addError(state, `activities insert page ${proj.key}@page${pageNumber}: ${err.message}`));
        }
      }

      // ── Bulk-insert inline comments returned with this page ─────────────────
      // The 'comment' field returns up to maxResults comments inline.
      // Issues with total > maxResults are recorded for Phase 5 to paginate.
      if (state.options?.importComments) {
        const commentPlaceholders: string[] = [];
        const commentParams: unknown[] = [];
        for (const issue of page.issues ?? []) {
          const localIssueId = state.jiraIssueKeyToLocalId[issue.key];
          if (!localIssueId) continue;
          const commentData = issue.fields?.comment;
          if (!commentData) continue;
          const inlineComments: any[] = commentData.comments ?? [];
          const commentTotal: number = commentData.total ?? 0;
          // If more pages exist, record startAt for Phase 5
          if (commentTotal > inlineComments.length) {
            state.issuesNeedingCommentPagination!.set(issue.key, inlineComments.length);
          }
          for (const comment of inlineComments) {
            const authorAccountId = comment.author?.accountId;
            const authorEmail = comment.author?.emailAddress?.toLowerCase();
            const authorId = (authorAccountId && state.jiraAccountIdToLocalId[authorAccountId])
              ?? (authorEmail && state.jiraUserEmailToLocalId[authorEmail])
              ?? state.triggeredById;
            // W-7 (C-07): log when all author lookups exhaust — don't silently discard
            if (!authorId) {
              addError(state, `inline comment on ${issue.key} (author=${authorAccountId ?? authorEmail ?? 'unknown'}) skipped: author not found in org`);
              continue;
            }
            const body = extractDescription(comment.body) ?? '';
            // W-8 (C-08): use syntheticCommentId when Jira omits comment.id (old Server)
            const jiraCommentId: string =
              comment.id ?? syntheticCommentId(issue.key, comment.created ?? null, authorId);
            const j = commentPlaceholders.length;
            commentPlaceholders.push(
              `(gen_random_uuid(), $${j*5+1}::text, $${j*5+2}::uuid, $${j*5+3}::uuid, COALESCE($${j*5+4}::timestamptz, NOW()), NOW(), $${j*5+5}::varchar)`,
            );
            commentParams.push(body, localIssueId, authorId, comment.created ?? null, jiraCommentId);
          }
        }
        if (commentPlaceholders.length > 0) {
          await client.query(
            `INSERT INTO comments (id, content, issue_id, author_id, created_at, updated_at, jira_comment_id)
             VALUES ${commentPlaceholders.join(', ')}
             ON CONFLICT (issue_id, jira_comment_id) WHERE jira_comment_id IS NOT NULL
             DO UPDATE SET content = EXCLUDED.content, updated_at = NOW(), deleted_at = NULL`,
            commentParams,
          ).catch((err: any) => addError(state, `inline comments bulk insert page ${proj.key}@page${pageNumber}: ${err.message}`));
          // Track for counter — counts both INSERT and ON CONFLICT DO UPDATE rows.
          inlineCommentCount += commentPlaceholders.length;
        }
      }

      // ── Stage attachment metadata for Phase 6 ───────────────────────────────
      if (state.options?.importAttachments) {
        const stagingRows: unknown[][] = [];
        for (const issue of page.issues ?? []) {
          const localId = state.jiraIssueKeyToLocalId[issue.key];
          if (!localId) continue;
          for (const att of (issue.fields?.attachment ?? []) as JiraApiAttachment[]) {
            // Skip ghost/stub attachments — Jira sometimes exposes entries with
            // size=0 (orphan ADF media refs, failed uploads, re-upload collisions
            // renamed to "name (uuid).ext"). Downloading them yields empty files
            // that render as broken thumbnails. Nothing useful to migrate.
            if (!att.size || att.size <= 0) {
              console.log(
                `[Migration:${state.id}] Skipping 0-byte Jira attachment ` +
                `"${att.filename}" (id=${att.id}) on ${issue.key}`,
              );
              continue;
            }
            stagingRows.push([
              state.id,          // migration_run_id
              state.organizationId, // organization_id
              att.id,            // jira_attachment_id
              issue.key,         // jira_issue_key
              localId,           // local_issue_id
              att.content,       // download_url
              att.filename,      // file_name
              att.mimeType,      // mime_type
              att.size,          // file_size
            ]);
          }
        }

        if (stagingRows.length > 0) {
          const stagingPlaceholders = stagingRows
            .map((_, i) => {
              const b = i * 9 + 1;
              return `($${b}::uuid,$${b+1}::uuid,$${b+2},$${b+3},$${b+4}::uuid,$${b+5},$${b+6},$${b+7},$${b+8}::bigint)`;
            })
            .join(', ');
          await client.query(
            `INSERT INTO jira_migration_attachment_staging
               (migration_run_id, organization_id, jira_attachment_id, jira_issue_key, local_issue_id,
                download_url, file_name, mime_type, file_size)
             VALUES ${stagingPlaceholders}
             ON CONFLICT (migration_run_id, jira_attachment_id) DO NOTHING`,
            stagingRows.flat(),
          ).catch((err: any) => {
            issueErrors.push(`attachment staging insert page ${proj.key}@page${pageNumber}: ${err.message}`);
          });
        }
      }

      // Advance cursor — absent nextPageToken OR empty page means this was the last page.
      // Guard: if the token is present but Jira returns zero issues (e.g. GDPR-filtered
      // or permission-restricted pages) we must stop to avoid an infinite loop.
      nextPageToken = page.nextPageToken;
      const pageSize = page.issues?.length ?? 0;
      hasMore = !!nextPageToken && pageSize > 0;
      totalIssues += pageSize;

      await updateRunProgress(client, state.id, {
        processedIssues,
        failedIssues,
        totalIssues,
        processedSprints: inlineSprintsCreated,
        errorLog: state.errorLog,
      }, io);

      if (hasMore) await delay(REQUEST_DELAY_MS);
    }

    // ── Update projects.next_issue_number so new issues get correct numbers ──
    await client.query(
      `UPDATE projects
       SET next_issue_number = (
         SELECT COALESCE(MAX(number), 0) + 1 FROM issues WHERE project_id = $1
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [projectId],
    ).catch((err: any) => addError(state, `next_issue_number update for ${proj.key}: ${err.message}`));

    // ── Verification log per project ─────────────────────────────────────────
    const { rows: verifyRows } = await client.query<{
      issue_count: number; sprint_count: number; status_count: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM issues WHERE project_id = $1)::int AS issue_count,
         (SELECT COUNT(*) FROM sprints WHERE project_id = $1)::int AS sprint_count,
         (SELECT COUNT(*) FROM issue_statuses WHERE project_id = $1)::int AS status_count`,
      [projectId],
    ).catch(() => ({ rows: [] as any[] }));
    const v = verifyRows[0] ?? { issue_count: 0, sprint_count: 0, status_count: 0 };
    console.log(
      `[Migration] ${proj.key}: ${v.issue_count} issues imported, ${v.sprint_count} sprints, ${v.status_count} statuses`,
    );

    // Reset offset for next project
    state.currentOffset = 0;
    await updateRunProgress(client, state.id, { currentOffset: 0 }, null);
  }

  // Second pass: link parent/subtask relationships + issue links
  await linkParentIssues(client, state, parentMap);
  await importIssueLinks(client, state, issueLinkAccum);

  // Dump accumulated issue errors to worker logs so they are never lost
  // (the shared errorLog ring buffer only keeps 100 entries and comment errors can evict these).
  if (issueErrors.length > 0) {
    console.error(
      `[Migration:${state.id}] Phase 4 — ${issueErrors.length} issue insert error(s):\n` +
      issueErrors.join('\n'),
    );
  }

  // Persist the inline comment count so Phase 5 can add to it rather than reset.
  state.inlineCommentsInserted = inlineCommentCount;

  await updateRunProgress(client, state.id, {
    totalIssues,
    processedIssues,
    failedIssues,
    processedSprints: inlineSprintsCreated,
    totalSprints: inlineSprintsCreated,
    // Seed comment counters with inline totals — Phase 5 will add overflow counts on top.
    totalComments: inlineCommentCount,
    processedComments: inlineCommentCount,
    completedPhase: PHASE_ISSUES,
  }, io);

  console.log(`[Migration:${state.id}] Phase 4 done — ${processedIssues}/${totalIssues} issues, ${failedIssues} failed, ${inlineSprintsCreated} inline sprints, ${inlineCommentCount} inline comments`);
}

async function linkParentIssues(
  client: PoolClient,
  state: RunState,
  parentMap: Record<string, string>, // jiraKey → parentJiraKey
): Promise<void> {
  const pairs = Object.entries(parentMap)
    .map(([jiraKey, parentJiraKey]) => ({
      id: state.jiraIssueKeyToLocalId[jiraKey],
      parentId: state.jiraIssueKeyToLocalId[parentJiraKey],
    }))
    .filter(p => p.id && p.parentId);

  if (pairs.length > 0) {
    const placeholders = pairs.map((_, i) => `($${i*2+1}::uuid, $${i*2+2}::uuid)`).join(', ');
    const params = pairs.flatMap(p => [p.id, p.parentId]);
    await client.query(
      `UPDATE issues SET parent_id = v.parent_id, updated_at = NOW()
       FROM (VALUES ${placeholders}) AS v(issue_id, parent_id)
       WHERE issues.id = v.issue_id AND issues.organization_id = $${params.length + 1}`,
      [...params, state.organizationId],
    ).catch((err: any) => console.error(`[Migration] parent links batch: ${err.message}`));
  }
  console.log(`[Migration] Parent links set: ${pairs.length}`);
}

async function importIssueLinks(
  client: PoolClient,
  state: RunState,
  issueLinkAccum: Array<{ sourceKey: string; links: any[] }>,
): Promise<void> {
  const allLinks: Array<[string, string, string, string]> = []; // [sourceId, targetId, linkType, createdBy]
  for (const { sourceKey, links } of issueLinkAccum) {
    const sourceId = state.jiraIssueKeyToLocalId[sourceKey];
    if (!sourceId) continue;
    for (const link of links) {
      // Jira returns either outwardIssue or inwardIssue depending on link direction
      const targetKey = link.outwardIssue?.key ?? link.inwardIssue?.key;
      const targetId = targetKey ? state.jiraIssueKeyToLocalId[targetKey] : null;
      if (!targetId) continue; // target not imported (different project / not selected)
      allLinks.push([sourceId, targetId, mapIssueLinkType(link.type?.name), state.triggeredById]);
    }
  }

  if (allLinks.length > 0) {
    const LINK_CHUNK = 500;
    for (let i = 0; i < allLinks.length; i += LINK_CHUNK) {
      const chunk = allLinks.slice(i, i + LINK_CHUNK);
      const placeholders = chunk.map((_, j) => `(gen_random_uuid(), $${j*4+1}::uuid, $${j*4+2}::uuid, $${j*4+3}::text, $${j*4+4}::uuid, NOW())`).join(', ');
      await client.query(
        `INSERT INTO issue_links (id, source_issue_id, target_issue_id, link_type, created_by, created_at)
         VALUES ${placeholders}
         ON CONFLICT (source_issue_id, target_issue_id, link_type) DO NOTHING`,
        chunk.flat(),
      ).catch(() => {}); // silently skip duplicate / FK violations
    }
  }
  console.log(`[Migration] Issue links imported: ${allLinks.length}`);
}

function mapIssueLinkType(name?: string): string {
  if (!name) return 'relates';
  const n = name.toLowerCase();
  if (n.includes('block')) return 'blocks';
  if (n.includes('duplicat')) return 'duplicates';
  if (n.includes('clone')) return 'clones';
  return 'relates';
}

// ─── Phase 5: Comments ────────────────────────────────────────────────────────

async function runCommentsPhase(
  client: PoolClient,
  state: RunState,
  credentials: JiraCredentials,
  io: IORedis | null,
): Promise<void> {
  console.log(`[Migration:${state.id}] Phase 5 — comments`);

  if (!state.options?.importComments) {
    await updateRunProgress(client, state.id, { completedPhase: PHASE_COMMENTS }, io);
    return;
  }

  await updateRunProgress(client, state.id, {
    status: 'processing',
    currentPhase: PHASE_COMMENTS,
  }, io);

  // Determine which issues need comment fetching:
  // - issuesNeedingCommentPagination present → Phase 4 ran in this process; only paginate issues
  //   where inline comments were partial (total > maxResults returned inline).
  // - issuesNeedingCommentPagination absent → worker restarted (resume path); fetch all issues
  //   from startAt=0 since inline comments were not captured.
  const isResume = !state.issuesNeedingCommentPagination;

  // Build work list: issues to paginate with their starting offset
  const workList: Array<{ jiraKey: string; localIssueId: string; startAt: number }> = [];
  for (const [jiraKey, localIssueId] of Object.entries(state.jiraIssueKeyToLocalId)) {
    if (isResume) {
      workList.push({ jiraKey, localIssueId, startAt: 0 });
    } else {
      const startAt = state.issuesNeedingCommentPagination!.get(jiraKey);
      if (startAt !== undefined) {
        workList.push({ jiraKey, localIssueId, startAt });
      }
    }
  }

  // When Phase 4 ran in this process but produced an empty worklist (no overflow issues)
  // AND no inline comments were found at all, Jira likely did not include the `comment`
  // field in its JQL response (common in some Jira Cloud configurations). In that case
  // fall back to fetching comments for every issue individually, just like the resume path.
  const jiraOmittedInlineComments =
    !isResume &&
    workList.length === 0 &&
    (state.inlineCommentsInserted ?? 0) === 0 &&
    Object.keys(state.jiraIssueKeyToLocalId).length > 0;

  if (jiraOmittedInlineComments) {
    for (const [jiraKey, localIssueId] of Object.entries(state.jiraIssueKeyToLocalId)) {
      workList.push({ jiraKey, localIssueId, startAt: 0 });
    }
  }

  if (isResume) {
    console.log(
      `[Migration:${state.id}] Phase 5 — RESUME path: re-fetching ALL ${workList.length} issues from startAt=0 ` +
      `(Phase 4 ran in a previous process; in-memory issuesNeedingCommentPagination was lost)`,
    );
  } else if (jiraOmittedInlineComments) {
    console.log(
      `[Migration:${state.id}] Phase 5 — FALLBACK path: Jira did not return inline comment data in JQL response; ` +
      `re-fetching comments for all ${workList.length} issues individually`,
    );
  } else {
    const overflowCount = state.issuesNeedingCommentPagination?.size ?? 0;
    console.log(
      `[Migration:${state.id}] Phase 5 — normal path: paginating ${overflowCount} issues with overflow comments ` +
      `(${workList.length} total in worklist), ${state.inlineCommentsInserted ?? 0} already inserted inline`,
    );
  }

  // Seed from Phase 4's inline count so we don't overwrite it with 0 at the end.
  // On resume (worker restart), inlineCommentsInserted is undefined — start from 0.
  let totalComments = state.inlineCommentsInserted ?? 0;
  let processedComments = state.inlineCommentsInserted ?? 0;
  const COMMENT_PAGE = 100;
  const FLUSH_EVERY = 10;

  // Process issues sequentially — a PoolClient is not safe for concurrent use.
  // Mixing concurrent client.query() calls on the same connection corrupts its
  // state and causes the phase to hang indefinitely. Sequential processing avoids
  // this while still pipelining the Jira HTTP fetch (no DB I/O during that await).
  for (let i = 0; i < workList.length; i++) {
    const item = workList[i];
    try {
      const allComments: any[] = [];
      let commentStart = item.startAt;
      let hasMore = true;

      while (hasMore) {
        const resp = await jiraGet<{ comments: any[]; total: number }>(
          credentials,
          `/rest/api/3/issue/${item.jiraKey}/comment?startAt=${commentStart}&maxResults=${COMMENT_PAGE}`,
        ).catch(() => ({ comments: [], total: 0 }));
        const page = resp.comments ?? [];
        allComments.push(...page);
        commentStart += COMMENT_PAGE;
        // Stop if the page returned no items — avoids an infinite loop when Jira
        // reports total > 0 but serves empty pages (GDPR-hidden or permission-restricted comments).
        if (page.length === 0) break;
        hasMore = allComments.length < (resp.total ?? 0);
      }

      totalComments += allComments.length;

      if (allComments.length > 0) {
        const placeholders: string[] = [];
        const params: unknown[] = [];
        for (const comment of allComments) {
          // Look up author by accountId first — Jira Cloud hides emails (GDPR).
          // Always fall back to the migration owner so author_id is never null.
          const authorAccountId = comment.author?.accountId;
          const authorEmail = comment.author?.emailAddress?.toLowerCase();
          const authorId = (authorAccountId && state.jiraAccountIdToLocalId[authorAccountId])
            ?? (authorEmail && state.jiraUserEmailToLocalId[authorEmail])
            ?? state.triggeredById;
          // W-7 (C-07): log when all fallbacks are exhausted — don't silently discard
          if (!authorId) {
            addError(state, `comment on ${item.jiraKey} (author=${authorAccountId ?? authorEmail ?? 'unknown'}) skipped: author not found in org`);
            continue;
          }
          const body = extractDescription(comment.body) ?? '';
          // W-8 (C-08): use syntheticCommentId when Jira omits comment.id (old Server)
          const jiraCommentId: string =
            comment.id ?? syntheticCommentId(item.jiraKey, comment.created ?? null, authorId);
          const j = placeholders.length;
          placeholders.push(
            `(gen_random_uuid(), $${j*5+1}::text, $${j*5+2}::uuid, $${j*5+3}::uuid, COALESCE($${j*5+4}::timestamptz, NOW()), NOW(), $${j*5+5}::varchar)`,
          );
          params.push(body, item.localIssueId, authorId, comment.created ?? null, jiraCommentId);
        }
        if (placeholders.length > 0) {
          await client.query(
            `INSERT INTO comments (id, content, issue_id, author_id, created_at, updated_at, jira_comment_id)
             VALUES ${placeholders.join(', ')}
             ON CONFLICT (issue_id, jira_comment_id) WHERE jira_comment_id IS NOT NULL
             DO UPDATE SET content = EXCLUDED.content, updated_at = NOW(), deleted_at = NULL`,
            params,
          ).catch((err: any) => addError(state, `comments bulk insert ${item.jiraKey}: ${err.message}`));
          processedComments += placeholders.length;
        }
      }
    } catch (err: any) {
      addError(state, `comments for ${item.jiraKey}: ${err.message}`);
    }

    if ((i + 1) % FLUSH_EVERY === 0) {
      await updateRunProgress(client, state.id, { totalComments, processedComments }, io);
    }
  }

  await updateRunProgress(client, state.id, {
    totalComments,
    processedComments,
    completedPhase: PHASE_COMMENTS,
  }, io);

  console.log(`[Migration:${state.id}] Phase 5 done — ${processedComments} comments inserted`);
}

// ─── MinIO / S3 helpers ───────────────────────────────────────────────────────

const MINIO_BUCKET = process.env.MINIO_BUCKET ?? 'boardupscale';
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50 MB hard limit
const ATTACHMENT_BATCH_SIZE = 20;

function initMinIOClient(): S3Client {
  const accessKeyId = process.env.MINIO_ACCESS_KEY;
  const secretAccessKey = process.env.MINIO_SECRET_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY must be set for attachment import');
  }
  const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  const port = process.env.MINIO_PORT ?? '9000';
  const useSSL = process.env.MINIO_USE_SSL === 'true';
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE !== 'false';
  return new S3Client({
    endpoint: `${useSSL ? 'https' : 'http'}://${endpoint}:${port}`,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle,
    // Hard timeouts so a slow/unreachable MinIO fails the phase instead of
    // hanging indefinitely (runPhaseWithRetry can only retry on thrown errors).
    maxAttempts: 3,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 5_000,   // 5s to establish TCP
      requestTimeout: 60_000,     // 60s for the whole upload/response
    }),
  });
}

async function ensureMinIOBucket(s3: S3Client, bucket: string): Promise<void> {
  try {
    await withDeadline(
      s3.send(new HeadBucketCommand({ Bucket: bucket })),
      15_000,
      `MinIO HeadBucket(${bucket})`,
    );
  } catch {
    await withDeadline(
      s3.send(new CreateBucketCommand({ Bucket: bucket })),
      15_000,
      `MinIO CreateBucket(${bucket})`,
    );
  }
}

/**
 * Rejects with a clear error if `promise` does not settle within `ms`.
 * Used to guarantee that slow/unreachable external services fail the phase
 * instead of hanging the worker.
 */
function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

// Safely extract the hostname from a URL for diagnostic logging. We never
// log the query string — Jira/AWS redirect targets contain signed auth tokens.
function safeUrlHost(rawUrl: string): string {
  try { return new URL(rawUrl).host; } catch { return 'unparseable'; }
}

function sanitizeStorageKey(runId: string, filename: string): string {
  // Strip path separators and control chars only — MinIO supports UTF-8 keys natively
  const safe = filename
    .replace(/[/\\]/g, '_')           // path separators
    .replace(/[\x00-\x1f\x7f]/g, '_') // control characters
    .slice(0, 200);
  return `jira/${runId}/${randomUUID()}-${safe}`;
}

/**
 * Open an HTTP(S) stream to `url` with auth, redirect-following, and 429 backoff.
 * Returns the response stream directly so callers can pipe it — no buffering.
 *
 * Security: auth header is stripped when following redirects to a different
 * hostname — prevents credential leakage to third-party CDNs.
 */
async function openAttachmentStream(
  url: string,
  authHeader: string,
  _attempt = 1,
  _originalHost = '',
): Promise<http.IncomingMessage> {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const transport = isHttps ? https : http;
  const originalHost = _originalHost || parsed.hostname;

  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const headers: Record<string, string> = { Accept: '*/*' };
    if (parsed.hostname === originalHost && authHeader) {
      headers['Authorization'] = authHeader;
    }

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
    };

    const req = transport.request(options, (res) => {
      const status = res.statusCode ?? 0;

      // Follow 3xx redirects. 303 (See Other) is included — some Jira Cloud
      // tenants return 303 from /rest/api/3/attachment/content/{id} to the
      // pre-signed AWS URL; not following it would silently read an empty
      // body from the redirect response itself and produce 0-byte uploads.
      if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
        res.resume();
        if (_attempt > 5) { reject(new Error('Too many redirects')); return; }
        const location = res.headers['location'];
        if (!location) { reject(new Error('Redirect with no Location header')); return; }
        const nextUrl = new URL(location, url).toString();
        openAttachmentStream(nextUrl, authHeader, _attempt + 1, originalHost)
          .then(resolve).catch(reject);
        return;
      }

      if (status === 429 && _attempt <= 4) {
        res.resume();
        const backoff = Math.pow(2, _attempt - 1) * 500;
        setTimeout(() => {
          openAttachmentStream(url, authHeader, _attempt + 1, originalHost)
            .then(resolve).catch(reject);
        }, backoff);
        return;
      }

      if (status >= 400) {
        res.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }

      // Stamp final-response metadata onto the stream so callers can diagnose
      // a 0-byte body (was it status 200 with Content-Length: 0? a 303 we
      // didn't follow? an unexpected 204?). Without this, empty downloads
      // produce indistinguishable "0 bytes" logs.
      (res as any).__finalUrl = url;
      (res as any).__finalStatus = status;
      (res as any).__finalContentLength = res.headers['content-length'] ?? null;
      (res as any).__finalContentType = res.headers['content-type'] ?? null;
      resolve(res);
    });

    req.on('error', (err) => {
      if (_attempt <= 4) {
        setTimeout(() => {
          openAttachmentStream(url, authHeader, _attempt + 1, originalHost)
            .then(resolve).catch(reject);
        }, 1000);
      } else {
        reject(err);
      }
    });

    // Socket-idle timeout: if no bytes flow for 30s, abort.
    // Total-deadline is enforced by the caller via withDeadline().
    req.setTimeout(30_000, () => {
      req.destroy(new Error('Stream idle for 30s'));
    });

    req.end();
  });
}

/**
 * Stream a Jira attachment directly into S3/MinIO via multipart upload.
 * - Zero buffering in worker memory (constant O(partSize) footprint).
 * - Size limit enforced by counting bytes through a PassThrough.
 * - Returns the number of bytes actually uploaded.
 */
interface StreamUploadResult {
  bytes: number;
  finalUrl: string;
  finalStatus: number;
  finalContentLength: string | null;
  finalContentType: string | null;
}

async function streamAttachmentToS3(args: {
  s3: S3Client;
  bucket: string;
  key: string;
  contentType: string;
  sourceUrl: string;
  authHeader: string;
  maxBytes: number;
}): Promise<StreamUploadResult> {
  const source = await openAttachmentStream(args.sourceUrl, args.authHeader);

  let bytesCounted = 0;
  let oversized = false;
  const passthrough = new PassThrough();

  source.on('data', (chunk: Buffer) => {
    bytesCounted += chunk.length;
    if (bytesCounted > args.maxBytes) {
      oversized = true;
      source.destroy(new Error(
        `Attachment exceeded ${Math.round(args.maxBytes / 1024 / 1024)}MB limit`,
      ));
    }
  });
  source.on('error', (err) => passthrough.destroy(err));
  source.pipe(passthrough);

  const upload = new Upload({
    client: args.s3,
    params: {
      Bucket: args.bucket,
      Key: args.key,
      Body: passthrough,
      ContentType: args.contentType,
    },
    queueSize: 4,          // 4 parts in flight
    partSize: 5 * 1024 * 1024, // 5MB — S3 minimum
    leavePartsOnError: false,
  });

  try {
    await upload.done();
  } catch (err: any) {
    if (oversized) throw new Error(`Attachment exceeded size limit`);
    throw err;
  }

  return {
    bytes: bytesCounted,
    finalUrl: (source as any).__finalUrl ?? args.sourceUrl,
    finalStatus: (source as any).__finalStatus ?? 0,
    finalContentLength: (source as any).__finalContentLength ?? null,
    finalContentType: (source as any).__finalContentType ?? null,
  };
}

// ─── Phase 6: Attachments ─────────────────────────────────────────────────────

async function runAttachmentsPhase(
  client: PoolClient,
  state: RunState,
  io: IORedis | null,
): Promise<void> {
  console.log(`[Migration:${state.id}] Phase 6 — attachments`);

  if (!state.options?.importAttachments) {
    await updateRunProgress(client, state.id, { completedPhase: PHASE_ATTACHMENTS }, io);
    console.log(`[Migration:${state.id}] Attachments disabled — skipping`);
    return;
  }

  // Emit the phase change up-front so the UI log shows "Syncing Attachments..."
  // even if the MinIO check below hangs or fails.
  await updateRunProgress(client, state.id, { currentPhase: PHASE_ATTACHMENTS }, io);

  // Verify MinIO is reachable before entering the loop (fail fast, phase is resumable)
  let s3: S3Client;
  try {
    s3 = initMinIOClient();
    await ensureMinIOBucket(s3, MINIO_BUCKET);
  } catch (err: any) {
    addError(state, `Phase 6: MinIO unavailable — ${err.message}`);
    await updateRunProgress(client, state.id, { errorLog: state.errorLog }, io);
    throw err; // re-throw so runPhaseWithRetry can retry the phase
  }

  // Count total pending rows for progress UI
  const { rows: [countRow] } = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM jira_migration_attachment_staging
     WHERE migration_run_id = $1 AND downloaded_at IS NULL`,
    [state.id],
  );
  state.totalAttachments = parseInt(countRow.count, 10);
  state.processedAttachments = 0;
  await updateRunProgress(client, state.id, {
    totalAttachments: state.totalAttachments,
    processedAttachments: 0,
    currentPhase: PHASE_ATTACHMENTS,
  }, io);

  // Jira OAuth tokens last 1 hour. The attachment phase can run for many hours,
  // so we MUST refresh the Bearer token periodically or every download after
  // ~60 min will 401. loadCredentials() internally refreshes if token is within
  // 5 min of expiring — we just need to call it again periodically.
  const buildAuthHeader = (c: JiraCredentials) =>
    c.email
      ? `Basic ${Buffer.from(`${c.email}:${c.apiToken}`).toString('base64')}`
      : `Bearer ${c.apiToken}`;

  let credentials = await loadCredentials(client, state.connectionId, state.organizationId);
  let authHeader = buildAuthHeader(credentials);
  let lastCredentialRefresh = Date.now();
  const CRED_REFRESH_INTERVAL_MS = 30 * 60_000; // every 30 min — well before 1h TTL

  const ensureFreshCredentials = async () => {
    if (Date.now() - lastCredentialRefresh < CRED_REFRESH_INTERVAL_MS) return;
    try {
      credentials = await loadCredentials(client, state.connectionId, state.organizationId);
      authHeader = buildAuthHeader(credentials);
      lastCredentialRefresh = Date.now();
      console.log(`[Migration:${state.id}] Refreshed Jira credentials (30-min tick)`);
    } catch (err: any) {
      console.warn(`[Migration:${state.id}] Credential refresh failed: ${err.message}`);
    }
  };

  console.log(
    `[Migration:${state.id}] Phase 6 — ${state.totalAttachments} attachments to download`,
  );

  // ── Batch loop ───────────────────────────────────────────────────────────────
  while (true) {
    const { rows: batch } = await client.query<{
      id: string;
      jira_attachment_id: string;
      local_issue_id: string;
      download_url: string;
      file_name: string;
      mime_type: string;
      file_size: string;
    }>(
      `SELECT id, jira_attachment_id, local_issue_id, download_url,
              file_name, mime_type, file_size
       FROM jira_migration_attachment_staging
       WHERE migration_run_id = $1
         AND downloaded_at IS NULL
         AND attempt_count < 3
       ORDER BY jira_issue_key, file_name
       LIMIT $2`,
      [state.id, ATTACHMENT_BATCH_SIZE],
    );

    if (batch.length === 0) break;

    // Refresh OAuth bearer token if it's been 30 minutes — prevents 401s mid-phase.
    await ensureFreshCredentials();

    for (const row of batch) {
      // Increment attempt count first — crash mid-download still counts
      await client.query(
        `UPDATE jira_migration_attachment_staging
         SET attempt_count = attempt_count + 1
         WHERE id = $1`,
        [row.id],
      );

      const fileSize = parseInt(row.file_size, 10);

      // Skip oversized files
      if (fileSize > MAX_ATTACHMENT_BYTES) {
        const msg = `Attachment "${row.file_name}" skipped — ${Math.round(fileSize / 1024 / 1024)}MB exceeds ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB limit`;
        addError(state, msg);
        await client.query(
          `UPDATE jira_migration_attachment_staging SET error = $1 WHERE id = $2`,
          [msg, row.id],
        );
        continue;
      }

      // Stream Jira → S3/MinIO via multipart upload — constant memory, no buffering.
      // 10-minute total deadline covers slow CDNs + slow MinIO for large files.
      const storageKey = sanitizeStorageKey(state.id, row.file_name);
      let uploadResult: StreamUploadResult = {
        bytes: 0, finalUrl: row.download_url, finalStatus: 0,
        finalContentLength: null, finalContentType: null,
      };
      const doStreamUpload = () =>
        withDeadline(
          streamAttachmentToS3({
            s3,
            bucket: MINIO_BUCKET,
            key: storageKey,
            contentType: row.mime_type,
            sourceUrl: row.download_url,
            authHeader,
            maxBytes: MAX_ATTACHMENT_BYTES,
          }),
          10 * 60_000,
          `Stream-upload "${row.file_name}"`,
        );
      try {
        try {
          uploadResult = await doStreamUpload();
        } catch (e: any) {
          // On 401, force a credential refresh and retry once — handles tokens
          // that expired between the 30-min ticks.
          if (/HTTP 401/.test(e?.message ?? '')) {
            lastCredentialRefresh = 0;
            await ensureFreshCredentials();
            uploadResult = await doStreamUpload();
          } else {
            throw e;
          }
        }
      } catch (err: any) {
        const msg = `Attachment "${row.file_name}": ${err.message}`;
        addError(state, msg);
        await client.query(
          `UPDATE jira_migration_attachment_staging SET error = $1 WHERE id = $2`,
          [msg, row.id],
        );
        continue;
      }

      // Validate the upload actually produced bytes that match Jira's reported
      // size. Protects against two failure modes that previously produced
      // "corrupted" attachment rows (0 B, broken thumbnails) in the UI:
      //   1. Terminal — Jira returned an empty stream (0 bytes downloaded).
      //      Ghost/stub attachment; don't retry, delete the empty MinIO object,
      //      mark staging row complete so it stops requeueing.
      //   2. Transient — bytes were transferred but fewer than expected (network
      //      truncation, CDN hiccup). Delete the partial object, leave staging
      //      row pending so attempt_count<3 retry loop picks it up. Falls
      //      through to terminal on final attempt.
      const expectedSize = parseInt(row.file_size, 10);
      const uploadedBytes = uploadResult.bytes;
      const sizeMismatch = expectedSize > 0 && uploadedBytes !== expectedSize;

      if (uploadedBytes === 0 || sizeMismatch) {
        // Best-effort: remove the (empty or partial) MinIO object — avoid leaks.
        await s3.send(
          new DeleteObjectCommand({ Bucket: MINIO_BUCKET, Key: storageKey }),
        ).catch((e: any) => {
          console.warn(
            `[Migration:${state.id}] Could not delete orphan MinIO object ` +
            `${storageKey}: ${e?.message ?? e}`,
          );
        });

        // Diagnostic detail — useful when "everything is 0 bytes" points to a
        // pipeline-wide failure (bad redirect handling, auth mismatch, etc.)
        // rather than genuinely empty files on Jira's side.
        const diag =
          `[status=${uploadResult.finalStatus} ` +
          `content-length=${uploadResult.finalContentLength ?? 'unset'} ` +
          `content-type=${uploadResult.finalContentType ?? 'unset'} ` +
          `final-url-host=${safeUrlHost(uploadResult.finalUrl)}]`;

        if (uploadedBytes === 0) {
          const cause =
            uploadResult.finalStatus === 200 &&
            (uploadResult.finalContentLength === '0' || uploadResult.finalContentLength === null)
              ? 'empty body from Jira (likely ghost/stub)'
              : `unexpected 0-byte response ${diag}`;
          const msg = `Attachment "${row.file_name}": ${cause}`;
          console.warn(`[Migration:${state.id}] ${msg} ${diag}`);
          addError(state, msg);
          // Terminal: mark downloaded_at so the batch loop stops picking it up.
          await client.query(
            `UPDATE jira_migration_attachment_staging
               SET error = $1, downloaded_at = NOW()
             WHERE id = $2`,
            [msg, row.id],
          );
        } else {
          const msg = `Attachment "${row.file_name}": size mismatch — Jira reported ${expectedSize} bytes, got ${uploadedBytes} ${diag}`;
          console.warn(`[Migration:${state.id}] ${msg}`);
          addError(state, msg);
          // Transient: leave downloaded_at NULL; attempt_count gate caps retries.
          await client.query(
            `UPDATE jira_migration_attachment_staging SET error = $1 WHERE id = $2`,
            [msg, row.id],
          );
        }
        continue;
      }

      // Insert attachment record — dedup is per-issue so the same Jira attachment
      // ID can legitimately exist for different orgs (multi-tenant safe).
      await client.query(
        `INSERT INTO attachments
           (id, issue_id, uploaded_by, file_name, file_size, mime_type,
            storage_key, storage_bucket, jira_attachment_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (issue_id, jira_attachment_id) WHERE jira_attachment_id IS NOT NULL DO NOTHING`,
        [
          randomUUID(),
          row.local_issue_id,
          state.triggeredById,
          row.file_name,
          uploadedBytes,
          row.mime_type,
          storageKey,
          MINIO_BUCKET,
          row.jira_attachment_id,
        ],
      ).catch((err: any) => addError(state, `attachments insert "${row.file_name}": ${err.message}`));

      // Mark staging row complete
      await client.query(
        `UPDATE jira_migration_attachment_staging SET downloaded_at = NOW() WHERE id = $1`,
        [row.id],
      );

      state.processedAttachments++;
      await updateRunProgress(client, state.id, {
        processedAttachments: state.processedAttachments,
        errorLog: state.errorLog,
      }, io);

      await delay(REQUEST_DELAY_MS);
    }
  }

  const failed = state.totalAttachments - state.processedAttachments;
  console.log(
    `[Migration:${state.id}] Phase 6 done — ${state.processedAttachments} downloaded, ${failed} failed/skipped`,
  );

  await updateRunProgress(client, state.id, {
    completedPhase: PHASE_ATTACHMENTS,
    errorLog: state.errorLog,
  }, io);
}

async function runRepairPhase(
  client: PoolClient,
  state: RunState,
): Promise<void> {
  const orgId = state.organizationId;
  console.log(`[Migration:${state.id}] Phase 7 — membership repair (orgId=${orgId})`);

  // Step 2a: Re-sync issue assignees → project_members
  await client.query(
    `INSERT INTO project_members (id, project_id, user_id, role, created_at)
     SELECT gen_random_uuid(), i.project_id, i.assignee_id, 'member', NOW()
     FROM issues i
     JOIN projects p ON p.id = i.project_id AND p.organization_id = $1
     WHERE i.assignee_id IS NOT NULL
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [orgId],
  );

  // Step 2b: Re-sync issue reporters → project_members
  await client.query(
    `INSERT INTO project_members (id, project_id, user_id, role, created_at)
     SELECT gen_random_uuid(), i.project_id, i.reporter_id, 'member', NOW()
     FROM issues i
     JOIN projects p ON p.id = i.project_id AND p.organization_id = $1
     WHERE i.reporter_id IS NOT NULL
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [orgId],
  );

  // Step 3: Re-sync comment authors → project_members
  await client.query(
    `INSERT INTO project_members (id, project_id, user_id, role, created_at)
     SELECT gen_random_uuid(), i.project_id, c.author_id, 'member', NOW()
     FROM comments c
     JOIN issues i ON i.id = c.issue_id
     JOIN projects p ON p.id = i.project_id AND p.organization_id = $1
     WHERE c.author_id IS NOT NULL
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [orgId],
  );

  // Step 1 (runs last): Ensure organization_members rows for ALL project_members users,
  // including those just added by Steps 2a/2b/3 above.
  // Use literal 'member' — users.role is a system-level role; org membership role is always 'member'.
  await client.query(
    `INSERT INTO organization_members (id, user_id, organization_id, role, is_default, created_at, updated_at)
     SELECT
       gen_random_uuid(),
       pm.user_id,
       p.organization_id,
       'member',
       false,
       NOW(),
       NOW()
     FROM project_members pm
     JOIN projects p ON p.id = pm.project_id
     WHERE p.organization_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM organization_members om
         WHERE om.user_id = pm.user_id AND om.organization_id = p.organization_id
       )
     ON CONFLICT (user_id, organization_id) DO NOTHING`,
    [orgId],
  );

  console.log(`[Migration:${state.id}] Phase 7 — membership repair complete`);
}

// ─── Comment helpers ──────────────────────────────────────────────────────────

/**
 * Returns a deterministic comment ID for upsert purposes.
 *
 * Some old Jira Server instances omit the comment `id` field entirely.
 * Without an ID the ON CONFLICT (issue_id, jira_comment_id) WHERE NOT NULL
 * clause never fires, so re-migration duplicates every such comment.
 *
 * We derive a stable synthetic ID from issueKey + createdAt + authorId so
 * re-imports produce the same ID and the ON CONFLICT hits correctly.
 * The "synthetic_" prefix prevents collisions with real Jira numeric IDs.
 */
function syntheticCommentId(
  issueKey: string,
  createdAt: string | null | undefined,
  authorId: string,
): string {
  const raw = `${issueKey}|${createdAt ?? ''}|${authorId}`;
  const hash = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
  return `synthetic_${hash}`;
}

// ─── Mapping helpers ──────────────────────────────────────────────────────────

function mapIssueType(name?: string): string {
  if (!name) return 'task';
  const n = name.toLowerCase();
  if (n === 'epic') return 'epic';
  if (n === 'story' || n === 'new feature' || n === 'improvement') return 'story';
  if (n === 'bug') return 'bug';
  if (n === 'sub-task' || n === 'subtask') return 'subtask';
  return 'task';
}

function mapPriority(name?: string): string {
  if (!name) return 'medium';
  const n = name.toLowerCase();
  if (n === 'highest' || n === 'blocker' || n === 'critical') return 'critical';
  if (n === 'high' || n === 'major') return 'high';
  if (n === 'low' || n === 'minor' || n === 'lowest' || n === 'trivial') return 'low';
  return 'medium';
}

function extractDescription(description: any, attachmentMap?: Map<string, string>): string | null {
  if (!description) return null;
  if (typeof description === 'string') return description;
  if (description.type === 'doc' && Array.isArray(description.content)) {
    return adfToText(description, attachmentMap).trim() || null;
  }
  return null;
}

// ─── Main job handler ─────────────────────────────────────────────────────────

async function processJob(
  job: Job<MigrationJobData>,
  db: Pool,
  io: IORedis | null,
): Promise<void> {
  // selectedMemberIds: null/undefined = import all, [] = import none, [...ids] = specific filter
  const { runId, organizationId, connectionId, selectedMemberIds = null, membersOnly = false } = job.data;

  console.log(`[Migration] Starting job for run ${runId} (attempt ${(job.attemptsMade ?? 0) + 1})`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const state = await loadRun(client, runId, organizationId);

    if (state.status === 'cancelled') {
      console.log(`[Migration:${runId}] Cancelled — skipping`);
      await client.query('COMMIT');
      return;
    }

    // Propagate selectedMemberIds from the job payload into run state
    state.selectedMemberIds = selectedMemberIds;
    state.membersOnly = membersOnly;

    const credentials = await loadCredentials(client, state.connectionId ?? connectionId, organizationId);
    await client.query('COMMIT');

    // Update to processing
    const progressClient = await db.connect();
    try {
      await updateRunProgress(progressClient, runId, {
        status: 'processing',
        currentPhase: state.currentPhase || PHASE_MEMBERS,
      }, io);

      const completed = new Set<number>(state.completedPhases ?? []);

      // ── Resolve triggeredById before any phase runs ──────────────────────────
      // Ensures the user who triggered the migration still exists. If they were
      // deleted, fall back to an org admin / any org member so FK constraints
      // don't abort phases.
      await resolveSafeTriggeredById(progressClient, state);

      // ── Phase 1 — members ────────────────────────────────────────────────────
      if (!completed.has(PHASE_MEMBERS)) {
        await runPhaseWithRetry('members', state, () =>
          runMembersPhase(progressClient, state, credentials, io),
        );
        state.completedPhases = [...(state.completedPhases ?? []), PHASE_MEMBERS];
      } else {
        console.log(`[Migration:${runId}] Phase 1 (members) already completed — reloading user maps`);
        // Rebuild email → localId map for all users in the org.
        const { rows } = await progressClient.query<{ email: string; id: string }>(
          `SELECT email, id FROM users WHERE organization_id = $1`,
          [organizationId],
        );
        for (const r of rows) state.jiraUserEmailToLocalId[r.email.toLowerCase()] = r.id;

        // Rebuild accountId → localId map from the jira_account_id column.
        // This is authoritative regardless of whether the user's email was later changed.
        const { rows: accountIdRows } = await progressClient.query<{ jira_account_id: string; id: string }>(
          `SELECT jira_account_id, id FROM users WHERE organization_id = $1 AND jira_account_id IS NOT NULL`,
          [organizationId],
        );
        for (const r of accountIdRows) {
          state.jiraAccountIdToLocalId[r.jira_account_id] = r.id;
        }
      }

      // Cancel check after Phase 1
      await checkCancelled(progressClient, runId);

      // ── Phase 1b — project member sync ──────────────────────────────────────
      if (!completed.has(PHASE_PROJECT_MEMBER_SYNC)) {
        await runPhaseWithRetry('project_member_sync', state, () =>
          runProjectMemberSyncPhase(progressClient, state, io),
        );
        state.completedPhases = [...(state.completedPhases ?? []), PHASE_PROJECT_MEMBER_SYNC];
      }

      await checkCancelled(progressClient, runId);

      // Members-only sync: exit cleanly after Phase 1 + 1b, skip Phases 2–6.
      if (state.membersOnly) {
        console.log(`[Migration:${runId}] Members-only run — completing after Phase 1b`);
        await updateRunProgress(progressClient, runId, {
          status: 'completed',
          completedPhase: PHASE_PROJECT_MEMBER_SYNC,
        }, io);
        return;
      }

      // ── Phase 2 — projects ───────────────────────────────────────────────────
      if (!completed.has(PHASE_PROJECTS)) {
        await runPhaseWithRetry('projects', state, () =>
          runProjectsPhase(progressClient, state, credentials, io),
        );
        state.completedPhases = [...(state.completedPhases ?? []), PHASE_PROJECTS];
      } else {
        console.log(`[Migration:${runId}] Phase 2 (projects) already completed — reloading project + status maps`);
        const { rows } = await progressClient.query<{ key: string; id: string }>(
          `SELECT key, id FROM projects WHERE organization_id = $1`,
          [organizationId],
        );
        for (const r of rows) state.jiraProjectIdToLocalId[r.key] = r.id;

        // Rebuild per-project status map so Phase 4 can resolve status_id
        const { rows: statusRows } = await progressClient.query<{
          project_id: string; id: string; name: string;
        }>(
          `SELECT s.project_id, s.id, s.name
           FROM issue_statuses s
           INNER JOIN projects p ON p.id = s.project_id
           WHERE p.organization_id = $1`,
          [organizationId],
        ).catch(() => ({ rows: [] as any[] }));
        for (const r of statusRows) {
          if (!state.projectStatusMap[r.project_id]) state.projectStatusMap[r.project_id] = {};
          state.projectStatusMap[r.project_id][r.name] = r.id;
        }
      }

      // Cancel check after Phase 2
      await checkCancelled(progressClient, runId);

      // ── Phase 3 — sprints ────────────────────────────────────────────────────
      if (!completed.has(PHASE_SPRINTS)) {
        await runPhaseWithRetry('sprints', state, () =>
          runSprintsPhase(progressClient, state, credentials, io),
        );
        state.completedPhases = [...(state.completedPhases ?? []), PHASE_SPRINTS];
      } else {
        console.log(`[Migration:${runId}] Phase 3 (sprints) already completed — reloading sprint map`);
        const { rows } = await progressClient.query<{ id: string }>(
          `SELECT s.id FROM sprints s
           INNER JOIN projects p ON p.id = s.project_id
           WHERE p.organization_id = $1`,
          [organizationId],
        ).catch(() => ({ rows: [] as any[] }));
        // Sprint map rebuilt on resume — jiraSprintIdToLocalId stays empty (sprints re-upsert by name)
      }

      // Cancel check after Phase 3
      await checkCancelled(progressClient, runId);

      // ── Phase 4 — issues ─────────────────────────────────────────────────────
      if (!completed.has(PHASE_ISSUES)) {
        await runPhaseWithRetry('issues', state, () =>
          runIssuesPhase(progressClient, state, credentials, io),
        );
        state.completedPhases = [...(state.completedPhases ?? []), PHASE_ISSUES];
      } else {
        console.log(`[Migration:${runId}] Phase 4 (issues) already completed — reloading issue map`);
        const { rows } = await progressClient.query<{ jira_key: string; id: string }>(
          `SELECT jira_key, id FROM issues WHERE organization_id = $1 AND jira_key IS NOT NULL`,
          [organizationId],
        ).catch(() => ({ rows: [] as any[] }));
        for (const r of rows) if (r.jira_key) state.jiraIssueKeyToLocalId[r.jira_key] = r.id;
      }

      // Cancel check after Phase 4
      await checkCancelled(progressClient, runId);

      // ── Phase 5 — comments ───────────────────────────────────────────────────
      if (!completed.has(PHASE_COMMENTS)) {
        await runPhaseWithRetry('comments', state, () =>
          runCommentsPhase(progressClient, state, credentials, io),
        );
        state.completedPhases = [...(state.completedPhases ?? []), PHASE_COMMENTS];
      }

      // Cancel check after Phase 5
      await checkCancelled(progressClient, runId);

      // ── Phase 6 — attachments ────────────────────────────────────────────────
      if (!completed.has(PHASE_ATTACHMENTS)) {
        await runPhaseWithRetry('attachments', state, () =>
          runAttachmentsPhase(progressClient, state, io),
        );
        state.completedPhases = [...(state.completedPhases ?? []), PHASE_ATTACHMENTS];
      }

      // ── Phase 7 — membership repair (non-fatal) ──────────────────────────────
      try {
        await runRepairPhase(progressClient, state);
      } catch (repairErr: any) {
        console.warn(`[Migration:${state.id}] Phase 7 repair failed (non-fatal): ${repairErr?.message}`);
      }

      // ── Write final result summary (read fresh counts from DB) ──────────────
      const { rows: finalCounts } = await progressClient.query<{
        processed_issues: number; failed_issues: number;
        processed_members: number; processed_sprints: number; processed_comments: number;
      }>(
        `SELECT processed_issues, failed_issues, processed_members, processed_sprints, processed_comments
         FROM jira_migration_runs WHERE id = $1`,
        [runId],
      );
      const fc = finalCounts[0] ?? { processed_issues: 0, failed_issues: 0, processed_members: 0, processed_sprints: 0, processed_comments: 0 };

      const summary = {
        projects: (state.selectedProjects ?? []).map((p) => ({
          key: p.key,
          name: p.name,
          issueCount: p.issueCount,
          status: fc.failed_issues > 0 ? 'partial' : 'success',
          boardupscaleProjectId: state.jiraProjectIdToLocalId[p.key],
        })),
        totalMigrated: fc.processed_issues,
        totalFailed: fc.failed_issues,
        totalMembers: fc.processed_members,
        totalSprints: fc.processed_sprints,
        failedItems: (state.errorLog ?? []).slice(0, 50).map((msg) => ({
          type: 'unknown',
          key: '',
          reason: msg,
        })),
      };

      await progressClient.query(
        `UPDATE jira_migration_runs
         SET status = 'completed', result_summary = $2, error_log = $3, completed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [runId, JSON.stringify(summary), JSON.stringify(state.errorLog ?? [])],
      );

      if (io) {
        io.publish('migration:progress', JSON.stringify({
          runId,
          phase: PHASE_ATTACHMENTS,
          status: 'completed',
          completedPhases: [1, 2, 3, 4, 5, 6],
          counts: {
            processedIssues: fc.processed_issues,
            totalIssues: fc.processed_issues,
            failedIssues: fc.failed_issues,
            processedMembers: fc.processed_members,
            totalMembers: fc.processed_members,
            processedSprints: fc.processed_sprints,
            totalSprints: fc.processed_sprints,
            processedComments: fc.processed_comments,
            totalComments: fc.processed_comments,
          },
        })).catch(() => {});
      }

      console.log(`[Migration:${runId}] Completed successfully — ${fc.processed_issues} issues, ${fc.processed_members} members, ${fc.processed_sprints} sprints, ${fc.processed_comments} comments`);
    } finally {
      progressClient.release();
    }
  } catch (err: any) {
    // Graceful stop — run was cancelled via the API; DB already has status='cancelled'.
    // Do NOT overwrite it with 'failed' and do NOT ask BullMQ to retry.
    if (err instanceof MigrationCancelledError) {
      console.log(`[Migration:${runId}] Stopped cleanly after cancellation.`);
      return;
    }

    console.error(`[Migration:${runId}] Fatal error:`, err.message, err.stack);
    const errClient = await db.connect();
    try {
      await errClient.query(
        `UPDATE jira_migration_runs
         SET status = 'failed',
             error_log = error_log || $2::jsonb,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [runId, JSON.stringify([`Fatal: ${err.message}`])],
      );
    } catch (dbErr: any) {
      console.error(`[Migration:${runId}] Failed to write failure status to DB:`, dbErr.message);
    } finally {
      errClient.release();
    }
    throw err; // Let BullMQ handle retry
  } finally {
    client.release();
  }
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export function createJiraMigrationWorker(
  db: Pool,
  io: IORedis | null = null,
): Worker {
  const workerConnection = createRedisConnection();

  const worker = new Worker<MigrationJobData>(
    QUEUE_NAME,
    async (job: Job<MigrationJobData>) => {
      await processJob(job, db, io);
    },
    {
      connection: workerConnection as any,
      concurrency: 2,       // max 2 simultaneous migrations
      lockDuration: 300000, // 5 minutes per lock renewal
    },
  );

  // Startup confirmation — visible in worker logs on every boot
  console.log(`[JiraMigrationWorker] Started — listening on queue "${QUEUE_NAME}" (concurrency: 2)`);

  worker.on('completed', (job) => {
    console.log(`[JiraMigrationWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[JiraMigrationWorker] Job ${job?.id} failed (attempt ${job?.attemptsMade ?? '?'}/${job?.opts?.attempts ?? '?'}):`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[JiraMigrationWorker] Worker-level error (queue connectivity issue):', err.message);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[JiraMigrationWorker] Job ${jobId} stalled — lock may have expired`);
  });

  return worker;
}
