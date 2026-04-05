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

// ─── Constants ───────────────────────────────────────────────────────────────

const QUEUE_NAME = 'jira-migration';
const PHASE_MEMBERS = 1;
const PHASE_PROJECTS = 2;
const PHASE_SPRINTS = 3;
const PHASE_ISSUES = 4;
const PHASE_COMMENTS = 5;
const PHASE_ATTACHMENTS = 6;

const REQUEST_DELAY_MS = 100; // 10 req/s courtesy throttle
const PROGRESS_FLUSH_MS = 5000; // DB write frequency

// ─── Types ────────────────────────────────────────────────────────────────────

interface MigrationJobData {
  runId: string;
  organizationId: string;
  connectionId: string;
  /** Jira accountIds to import. Empty array means import all members. */
  selectedMemberIds?: string[];
}

interface JiraCredentials {
  baseUrl: string;
  email: string;
  apiToken: string;
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
  errorLog: string[];
  jiraProjectIdToLocalId: Record<string, string>;
  jiraUserEmailToLocalId: Record<string, string>;
  jiraIssueKeyToLocalId: Record<string, string>;
  jiraSprintIdToLocalId: Record<string, string>;
  /**
   * Per-project map: projectId → (jiraStatusName → localStatusId).
   * Populated in Phase 2 so Phase 4 can resolve status_id without extra queries.
   */
  projectStatusMap: Record<string, Record<string, string>>;
  /** If non-empty, only these accountIds will be imported in the members phase. */
  selectedMemberIds: string[];
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

async function loadRun(client: PoolClient, runId: string): Promise<RunState> {
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
            COALESCE(error_log, '[]') AS "errorLog"
     FROM jira_migration_runs WHERE id = $1`,
    [runId],
  );
  if (!rows[0]) throw new Error(`Migration run ${runId} not found`);

  return {
    ...rows[0],
    completedPhases: rows[0].completedPhases ?? [],
    errorLog: rows[0].errorLog ?? [],
    jiraProjectIdToLocalId: {},
    jiraUserEmailToLocalId: {},
    jiraIssueKeyToLocalId: {},
    jiraSprintIdToLocalId: {},
    projectStatusMap: {},
    selectedMemberIds: [],
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
      counts: {
        processedProjects: state.processedProjects,
        totalProjects: state.totalProjects,
        processedIssues: state.processedIssues,
        totalIssues: state.totalIssues,
        processedMembers: state.processedMembers,
        processedSprints: state.processedSprints,
        processedComments: state.processedComments,
      },
    })).catch(() => {});
  }
}

function addError(state: RunState, msg: string) {
  state.errorLog = [...(state.errorLog ?? []), msg].slice(-100);
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
        `/rest/api/3/users/search?startAt=${startAt}&maxResults=${PAGE_SIZE}&includeInactive=false`,
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

  // Filter to only selected members when a selection was made
  const filterIds = new Set(state.selectedMemberIds ?? []);
  const filteredUsers = filterIds.size > 0
    ? users.filter((u) => filterIds.has(u.accountId))
    : users;

  await updateRunProgress(client, state.id, {
    status: 'processing',
    currentPhase: PHASE_MEMBERS,
    totalMembers: filteredUsers.length,
  }, io);

  let processed = 0;
  for (const jiraUser of filteredUsers) {
    if (!jiraUser.emailAddress) continue;
    const email = jiraUser.emailAddress.toLowerCase();
    try {
      // Apply role mapping: prefer lookup by accountId, fall back to email, then 'member'
      const roleMappingRecord = state.roleMapping ?? {};
      const mappedRole = roleMappingRecord[jiraUser.accountId] ?? roleMappingRecord[email] ?? 'member';
      const safeRole = ['admin', 'manager', 'member', 'viewer'].includes(mappedRole) ? mappedRole : 'member';

      // Upsert user — membership is via users.organization_id (single-org model).
      // ON CONFLICT: update display_name + role; set organization_id only when unset
      // so we never move an existing user between orgs.
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO users (id, email, display_name, organization_id, is_active, email_verified, role, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, true, false, $4, NOW(), NOW())
         ON CONFLICT (email) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           organization_id = COALESCE(users.organization_id, EXCLUDED.organization_id),
           role = EXCLUDED.role,
           updated_at = NOW()
         RETURNING id`,
        [email, jiraUser.displayName ?? email.split('@')[0], state.organizationId, safeRole],
      ).catch(() => ({ rows: [] as Array<{ id: string }> }));

      if (rows[0]) {
        state.jiraUserEmailToLocalId[email] = rows[0].id;
      }

      processed++;
    } catch (err: any) {
      addError(state, `member upsert ${email}: ${err.message}`);
    }
  }

  await updateRunProgress(client, state.id, {
    processedMembers: processed,
    completedPhase: PHASE_MEMBERS,
  }, io);

  console.log(`[Migration:${state.id}] Phase 1 done — ${processed}/${filteredUsers.length} members (${filterIds.size > 0 ? `${filterIds.size} selected out of ${users.length} total` : `all ${users.length} imported`})`);
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
        `INSERT INTO projects (id, name, key, description, organization_id, owner_id, type, color, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, '', $3, $4, 'scrum', $5, NOW(), NOW())
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

      // Step 3 — Patch name, color, and status on the existing row.
      // Always reset status to 'active' so previously-archived projects become visible again.
      await client.query(
        `UPDATE projects
            SET name = $1, color = COALESCE(color, $2::varchar), status = 'active', updated_at = NOW()
          WHERE id = $3::uuid`,
        [proj.name || proj.key, projectColor, projectId],
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
      const boardsResp = await jiraGet<{ values: Array<{ id: number; name: string }> }>(
        credentials,
        `/rest/agile/1.0/board?projectKeyOrId=${proj.key}`,
      ).catch(() => ({ values: [] }));

      const boardId = boardsResp?.values?.[0]?.id;
      if (!boardId) continue;

      // Paginate through ALL sprints — Jira Agile API default page size is 50.
      // Boards with many sprints (e.g. 100+) silently lose data without pagination.
      const SPRINT_PAGE = 50;
      const allSprints: Array<{
        id: number; name: string; state: string;
        startDate?: string; endDate?: string; goal?: string;
      }> = [];
      let sprintStart = 0;
      let sprintHasMore = true;
      while (sprintHasMore) {
        const sprintsResp = await jiraGet<{
          values: Array<{ id: number; name: string; state: string; startDate?: string; endDate?: string; goal?: string }>;
          isLast?: boolean;
          total?: number;
        }>(
          credentials,
          `/rest/agile/1.0/board/${boardId}/sprint?startAt=${sprintStart}&maxResults=${SPRINT_PAGE}`,
        ).catch(() => ({ values: [], isLast: true }));

        const page = sprintsResp?.values ?? [];
        allSprints.push(...page);

        // Jira Agile API signals last page via isLast=true OR by returning < maxResults
        sprintHasMore = !sprintsResp?.isLast && page.length === SPRINT_PAGE;
        sprintStart += SPRINT_PAGE;
      }
      const sprints = allSprints;
      totalSprints += sprints.length;

      for (const sprint of sprints) {
        try {
          // sprints table: id, project_id, name, goal, status, start_date, end_date, completed_at, created_at, updated_at
          const sprintStatus = sprint.state === 'active' ? 'active' : sprint.state === 'closed' ? 'completed' : 'planned';
          // completed_at: use endDate when available for closed sprints, otherwise NOW()
          const completedAt = sprintStatus === 'completed'
            ? (sprint.endDate ?? 'NOW()')
            : null;
          const { rows } = await client.query<{ id: string }>(
            `INSERT INTO sprints (id, name, status, goal, start_date, end_date, completed_at, project_id, created_at, updated_at)
             SELECT gen_random_uuid(), $1::text, $2::text, $3::text,
                    $4::date, $5::date,
                    $6::timestamp,
                    $7::uuid, NOW(), NOW()
             WHERE NOT EXISTS (SELECT 1 FROM sprints WHERE project_id = $7::uuid AND name = $1::text)
             RETURNING id`,
            [
              sprint.name,
              sprintStatus,
              sprint.goal ?? null,
              sprint.startDate ? sprint.startDate.substring(0, 10) : null,
              sprint.endDate ? sprint.endDate.substring(0, 10) : null,
              completedAt,
              projectId,
            ],
          );

          if (rows[0]) {
            state.jiraSprintIdToLocalId[String(sprint.id)] = rows[0].id;
            processedSprints++;
          } else {
            // Sprint already exists — look up its ID
            const { rows: existing } = await client.query<{ id: string }>(
              `SELECT id FROM sprints WHERE project_id = $1 AND name = $2 LIMIT 1`,
              [projectId, sprint.name],
            );
            if (existing[0]) state.jiraSprintIdToLocalId[String(sprint.id)] = existing[0].id;
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
  }, io);

  const PAGE_SIZE = 100;
  const FIELDS = [
    'summary', 'description', 'issuetype', 'priority', 'status',
    'assignee', 'reporter', 'created', 'updated', 'labels',
    'customfield_10016', 'customfield_10020', 'timetracking',
    'subtasks', 'parent', 'comment', 'issuelinks',
  ].join(',');

  let totalIssues = 0;
  let processedIssues = 0;
  let failedIssues = 0;

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
    let startAt = state.currentOffset; // resume support
    let hasMore = true;
    let firstPage = true;
    let projectIssueCount = 0;

    while (hasMore) {
      const encoded = encodeURIComponent(jql);
      const path = `/rest/api/3/search/jql?jql=${encoded}&startAt=${startAt}&maxResults=${PAGE_SIZE}&fields=${FIELDS}`;

      let page: { total: number; issues: any[] };
      try {
        page = await jiraGet<{ total: number; issues: any[] }>(credentials, path);
      } catch (err: any) {
        addError(state, `issues page ${proj.key}@${startAt}: ${err.message}`);
        break;
      }

      if (firstPage) {
        totalIssues += page.total ?? 0;
        firstPage = false;
      }

      for (const issue of page.issues ?? []) {
        try {
          const fields = issue.fields ?? {};
          const type = mapIssueType(fields.issuetype?.name);
          const priority = mapPriority(fields.priority?.name);

          // Resolve status_id from the in-memory map built in Phase 2.
          // Try exact Jira status name first, then fall back to 'To Do'.
          const jiraStatusName = fields.status?.name ?? 'To Do';
          const projectStatuses = state.projectStatusMap[projectId] ?? {};
          const statusMapping = state.statusMapping ?? {};
          const mappedStatusName = (statusMapping[jiraStatusName] ?? jiraStatusName).trim();
          const statusId =
            projectStatuses[jiraStatusName] ??
            projectStatuses[mappedStatusName] ??
            // Last resort: find any status with category 'todo' as the default column
            null;

          // If we still couldn't find it, try a live DB lookup (handles resume path)
          let resolvedStatusId = statusId;
          if (!resolvedStatusId) {
            const { rows: fallbackRows } = await client.query<{ id: string }>(
              `SELECT id FROM issue_statuses WHERE project_id = $1 AND category = 'todo' ORDER BY position LIMIT 1`,
              [projectId],
            );
            resolvedStatusId = fallbackRows[0]?.id ?? null;
          }

          // Assignee / reporter
          const assigneeEmail = fields.assignee?.emailAddress?.toLowerCase();
          const reporterEmail = fields.reporter?.emailAddress?.toLowerCase();
          const assigneeId = assigneeEmail ? state.jiraUserEmailToLocalId[assigneeEmail] ?? null : null;
          const reporterId = reporterEmail ? state.jiraUserEmailToLocalId[reporterEmail] ?? null : null;

          // Sprint (customfield_10020 is an array in Cloud API v3)
          let sprintId: string | null = null;
          const sprintArr = Array.isArray(fields.customfield_10020) ? fields.customfield_10020 : [];
          const activeSprint = sprintArr.find((s: any) => s.state === 'active') ?? sprintArr[0];
          if (activeSprint) {
            sprintId = state.jiraSprintIdToLocalId[String(activeSprint.id)] ?? null;
          }

          // Strip ADF description → plaintext
          const description = extractDescription(fields.description);

          // Extract numeric part from Jira key (e.g. DROM-46 → 46).
          // Use the DB sequence to avoid collisions on the (project_id, number) unique constraint:
          // if the Jira number is already taken by a different jira_key, auto-assign the next free number.
          const issueNumber = parseInt(issue.key.split('-').pop() ?? '0', 10) || 0;
          // reporter_id is NOT NULL — fall back to migration owner
          const safeReporterId = reporterId ?? state.triggeredById;

          const { rows: issueRows } = await client.query<{ id: string }>(
            `INSERT INTO issues (
               id, title, description, type, priority,
               status_id, project_id, organization_id,
               assignee_id, reporter_id, sprint_id,
               key, number, jira_key, labels, story_points,
               time_estimate, time_spent,
               created_at, updated_at
             )
             SELECT
               gen_random_uuid(), $1::text, $2::text, $3::text, $4::text,
               $5::uuid, $6::uuid, $7::uuid,
               $8::uuid, $9::uuid, $10::uuid,
               $11::text,
               CASE
                 WHEN NOT EXISTS (SELECT 1 FROM issues WHERE project_id = $6::uuid AND number = $12::int)
                 THEN $12::int
                 ELSE (SELECT COALESCE(MAX(number), 0) + 1 FROM issues WHERE project_id = $6::uuid)
               END,
               $13::text, $14::text[], $15::int,
               $16::int, $17::int,
               COALESCE($18::timestamptz, NOW()), COALESCE($19::timestamptz, NOW())
             WHERE NOT EXISTS (
               SELECT 1 FROM issues WHERE project_id = $6::uuid AND jira_key = $13::text
             )
             RETURNING id`,
            [
              fields.summary ?? issue.key,
              description,
              type,
              priority,
              resolvedStatusId,
              projectId,
              state.organizationId,
              assigneeId,
              safeReporterId,
              sprintId,
              issue.key,
              issueNumber,
              issue.key,
              Array.isArray(fields.labels) ? fields.labels : [],
              fields.customfield_10016 ?? null,
              fields.timetracking?.originalEstimateSeconds ?? null,
              fields.timetracking?.timeSpentSeconds ?? 0,
              fields.created ?? null,
              fields.updated ?? null,
            ],
          );

          if (issueRows[0]) {
            state.jiraIssueKeyToLocalId[issue.key] = issueRows[0].id;
            processedIssues++;
            projectIssueCount++;
          } else {
            // Already exists — look up ID for the comments phase
            const { rows: existing } = await client.query<{ id: string }>(
              `SELECT id FROM issues WHERE project_id = $1 AND jira_key = $2 LIMIT 1`,
              [projectId, issue.key],
            );
            if (existing[0]) state.jiraIssueKeyToLocalId[issue.key] = existing[0].id;
            processedIssues++;
            projectIssueCount++;
          }

          // Track parent key for the post-import parent-link pass
          if (fields.parent?.key) {
            parentMap[issue.key] = fields.parent.key;
          }
          // Track issue links for the post-import link pass
          if (Array.isArray(fields.issuelinks) && fields.issuelinks.length > 0) {
            issueLinkAccum.push({ sourceKey: issue.key, links: fields.issuelinks });
          }
        } catch (err: any) {
          addError(state, `issue ${issue.key}: ${err.message}`);
          failedIssues++;
        }
      }

      startAt += PAGE_SIZE;
      hasMore = startAt < (page.total ?? 0);

      // Update offset for resume
      await updateRunProgress(client, state.id, {
        currentOffset: startAt,
        processedIssues,
        failedIssues,
        totalIssues,
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

  await updateRunProgress(client, state.id, {
    totalIssues,
    processedIssues,
    failedIssues,
    completedPhase: PHASE_ISSUES,
  }, io);

  console.log(`[Migration:${state.id}] Phase 4 done — ${processedIssues}/${totalIssues} issues, ${failedIssues} failed`);
}

async function linkParentIssues(
  client: PoolClient,
  state: RunState,
  parentMap: Record<string, string>, // jiraKey → parentJiraKey
): Promise<void> {
  let linked = 0;
  for (const [jiraKey, parentJiraKey] of Object.entries(parentMap)) {
    const localId = state.jiraIssueKeyToLocalId[jiraKey];
    const parentLocalId = state.jiraIssueKeyToLocalId[parentJiraKey];
    if (!localId || !parentLocalId) continue; // parent from a different org/not selected — skip
    await client.query(
      `UPDATE issues SET parent_id = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3`,
      [parentLocalId, localId, state.organizationId],
    ).catch((err: any) =>
      console.error(`[Migration] parent link ${jiraKey} → ${parentJiraKey}: ${err.message}`),
    );
    linked++;
  }
  console.log(`[Migration] Parent links set: ${linked}`);
}

async function importIssueLinks(
  client: PoolClient,
  state: RunState,
  issueLinkAccum: Array<{ sourceKey: string; links: any[] }>,
): Promise<void> {
  let linked = 0;
  for (const { sourceKey, links } of issueLinkAccum) {
    const sourceId = state.jiraIssueKeyToLocalId[sourceKey];
    if (!sourceId) continue;
    for (const link of links) {
      // Jira returns either outwardIssue or inwardIssue depending on link direction
      const targetKey = link.outwardIssue?.key ?? link.inwardIssue?.key;
      const targetId = targetKey ? state.jiraIssueKeyToLocalId[targetKey] : null;
      if (!targetId) continue; // target not imported (different project / not selected)
      const linkType = mapIssueLinkType(link.type?.name);
      await client.query(
        `INSERT INTO issue_links (id, source_issue_id, target_issue_id, link_type, created_by, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
         ON CONFLICT (source_issue_id, target_issue_id, link_type) DO NOTHING`,
        [sourceId, targetId, linkType, state.triggeredById],
      ).catch(() => {}); // silently skip duplicate / FK violations
      linked++;
    }
  }
  console.log(`[Migration] Issue links imported: ${linked}`);
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

  let totalComments = 0;
  let processedComments = 0;

  for (const [jiraKey, localIssueId] of Object.entries(state.jiraIssueKeyToLocalId)) {
    try {
      // Paginate comments — Jira caps at 100 per page
      const allComments: any[] = [];
      let commentStart = 0;
      const COMMENT_PAGE = 100;
      let hasMoreComments = true;
      while (hasMoreComments) {
        const resp = await jiraGet<{ comments: any[]; total: number }>(
          credentials,
          `/rest/api/3/issue/${jiraKey}/comment?startAt=${commentStart}&maxResults=${COMMENT_PAGE}`,
        ).catch(() => ({ comments: [], total: 0 }));
        allComments.push(...(resp.comments ?? []));
        commentStart += COMMENT_PAGE;
        hasMoreComments = allComments.length < (resp.total ?? 0);
        if (hasMoreComments) await delay(REQUEST_DELAY_MS);
      }

      totalComments += allComments.length;

      for (const comment of allComments) {
        try {
          const authorEmail = comment.author?.emailAddress?.toLowerCase();
          const authorId = authorEmail ? state.jiraUserEmailToLocalId[authorEmail] ?? null : null;
          const body = extractDescription(comment.body) ?? '';

          await client.query(
            `INSERT INTO comments (id, content, issue_id, author_id, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, COALESCE($4::timestamptz, NOW()), NOW())
             ON CONFLICT DO NOTHING`,
            [body, localIssueId, authorId, comment.created ?? null],
          ).catch(() => {});

          processedComments++;
        } catch (err: any) {
          addError(state, `comment on ${jiraKey}: ${err.message}`);
        }
      }

      await delay(REQUEST_DELAY_MS);
    } catch (err: any) {
      addError(state, `comments for ${jiraKey}: ${err.message}`);
    }
  }

  await updateRunProgress(client, state.id, {
    totalComments,
    processedComments,
    completedPhase: PHASE_COMMENTS,
  }, io);

  console.log(`[Migration:${state.id}] Phase 5 done — ${processedComments} comments`);
}

// ─── Phase 6: Attachments ─────────────────────────────────────────────────────

async function runAttachmentsPhase(
  client: PoolClient,
  state: RunState,
  io: IORedis | null,
): Promise<void> {
  console.log(`[Migration:${state.id}] Phase 6 — attachments (skipped: feature not enabled in this run)`);

  if (!state.options?.importAttachments) {
    await updateRunProgress(client, state.id, { completedPhase: PHASE_ATTACHMENTS }, io);
    console.log(`[Migration:${state.id}] Attachments disabled — skipping`);
    return;
  }

  // Attachment import requires MinIO — log as deferred
  addError(state, 'Attachment import is not yet implemented — skipped');
  await updateRunProgress(client, state.id, {
    completedPhase: PHASE_ATTACHMENTS,
    errorLog: state.errorLog,
  }, io);
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

function extractDescription(description: any): string | null {
  if (!description) return null;
  if (typeof description === 'string') return description;
  if (description.type === 'doc' && Array.isArray(description.content)) {
    return adfToText(description).trim() || null;
  }
  return null;
}

function adfToText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  if (!Array.isArray(node.content)) return '';
  const parts = node.content.map((c: any) => adfToText(c));
  switch (node.type) {
    case 'paragraph': return parts.join('') + '\n';
    case 'bulletList': case 'orderedList': return parts.join('');
    case 'listItem': return '- ' + parts.join('').trim() + '\n';
    case 'codeBlock': return '```\n' + parts.join('') + '```\n';
    case 'hardBreak': return '\n';
    default: return parts.join('');
  }
}

// ─── Main job handler ─────────────────────────────────────────────────────────

async function processJob(
  job: Job<MigrationJobData>,
  db: Pool,
  io: IORedis | null,
): Promise<void> {
  const { runId, organizationId, connectionId, selectedMemberIds = [] } = job.data;

  console.log(`[Migration] Starting job for run ${runId} (attempt ${(job.attemptsMade ?? 0) + 1})`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const state = await loadRun(client, runId);

    if (state.status === 'cancelled') {
      console.log(`[Migration:${runId}] Cancelled — skipping`);
      await client.query('COMMIT');
      return;
    }

    // Propagate selectedMemberIds from the job payload into run state
    state.selectedMemberIds = selectedMemberIds;

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

      // ── Phase 1 — members ────────────────────────────────────────────────────
      if (!completed.has(PHASE_MEMBERS)) {
        await runPhaseWithRetry('members', state, () =>
          runMembersPhase(progressClient, state, credentials, io),
        );
        state.completedPhases = [...(state.completedPhases ?? []), PHASE_MEMBERS];
      } else {
        console.log(`[Migration:${runId}] Phase 1 (members) already completed — reloading user map`);
        const { rows } = await progressClient.query<{ email: string; id: string }>(
          `SELECT email, id FROM users WHERE organization_id = $1`,
          [organizationId],
        );
        for (const r of rows) state.jiraUserEmailToLocalId[r.email.toLowerCase()] = r.id;
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

      // ── Phase 5 — comments ───────────────────────────────────────────────────
      if (!completed.has(PHASE_COMMENTS)) {
        await runPhaseWithRetry('comments', state, () =>
          runCommentsPhase(progressClient, state, credentials, io),
        );
      }

      // ── Phase 6 — attachments ────────────────────────────────────────────────
      if (!completed.has(PHASE_ATTACHMENTS)) {
        await runPhaseWithRetry('attachments', state, () =>
          runAttachmentsPhase(progressClient, state, io),
        );
      }

      // ── Write final result summary (read fresh counts from DB) ──────────────
      const { rows: finalCounts } = await progressClient.query<{
        processed_issues: number; failed_issues: number;
        processed_members: number; processed_sprints: number;
      }>(
        `SELECT processed_issues, failed_issues, processed_members, processed_sprints
         FROM jira_migration_runs WHERE id = $1`,
        [runId],
      );
      const fc = finalCounts[0] ?? { processed_issues: 0, failed_issues: 0, processed_members: 0, processed_sprints: 0 };

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
          counts: {
            processedProjects: state.processedProjects,
            totalProjects: state.totalProjects,
            processedIssues: state.processedIssues,
            totalIssues: state.totalIssues,
          },
        })).catch(() => {});
      }

      console.log(`[Migration:${runId}] Completed successfully — ${state.processedIssues} issues, ${state.processedMembers} members`);
    } finally {
      progressClient.release();
    }
  } catch (err: any) {
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
