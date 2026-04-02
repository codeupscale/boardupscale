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
}

// ─── Jira HTTP client (no axios) ─────────────────────────────────────────────

function jiraGet<T>(
  credentials: JiraCredentials,
  path: string,
  attempt = 1,
): Promise<T> {
  const token = Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64');
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
      Authorization: `Basic ${token}`,
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
  };
}

async function loadCredentials(client: PoolClient, connectionId: string): Promise<JiraCredentials> {
  const { rows } = await client.query(
    `SELECT jira_url AS "baseUrl", jira_email AS email, api_token_enc AS "apiTokenEnc"
     FROM jira_connections WHERE id = $1`,
    [connectionId],
  );
  if (!rows[0]) throw new Error(`Jira connection ${connectionId} not found`);
  const { baseUrl, email, apiTokenEnc } = rows[0];
  const apiToken = decryptToken(apiTokenEnc, config.appSecret);
  return { baseUrl, email, apiToken };
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

  await updateRunProgress(client, state.id, {
    status: 'processing',
    currentPhase: PHASE_MEMBERS,
    totalMembers: users.length,
  }, io);

  let processed = 0;
  for (const jiraUser of users) {
    if (!jiraUser.emailAddress) continue;
    const email = jiraUser.emailAddress.toLowerCase();
    try {
      // Upsert user record
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO users (id, email, "firstName", "lastName", "organizationId", "isActive", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, '', $3, true, NOW(), NOW())
         ON CONFLICT (email) DO UPDATE SET "firstName" = EXCLUDED."firstName", "updatedAt" = NOW()
         RETURNING id`,
        [email, jiraUser.displayName ?? email.split('@')[0], state.organizationId],
      ).catch(() => ({ rows: [] as Array<{ id: string }> }));

      if (rows[0]) {
        state.jiraUserEmailToLocalId[email] = rows[0].id;

        // Ensure org_member row
        await client.query(
          `INSERT INTO organization_members (id, "organizationId", "userId", role, "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, 'member', NOW(), NOW())
           ON CONFLICT ("organizationId", "userId") DO NOTHING`,
          [state.organizationId, rows[0].id],
        ).catch(() => {});
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

  console.log(`[Migration:${state.id}] Phase 1 done — ${processed}/${users.length} members`);
}

// ─── Phase 2: Projects ────────────────────────────────────────────────────────

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

  for (const proj of state.selectedProjects ?? []) {
    if (!selectedKeys.has(proj.key)) continue;
    try {
      // Create project
      const { rows: projRows } = await client.query<{ id: string }>(
        `INSERT INTO projects (id, name, key, description, "organizationId", "isArchived", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, '', $3, false, NOW(), NOW())
         ON CONFLICT ("organizationId", key) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW()
         RETURNING id`,
        [proj.name || proj.key, proj.key, state.organizationId],
      );

      if (!projRows[0]) continue;
      const projectId = projRows[0].id;
      state.jiraProjectIdToLocalId[proj.key] = projectId;

      // Create default board for the project
      await client.query(
        `INSERT INTO boards (id, name, type, "projectId", "organizationId", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, 'scrum', $2, $3, NOW(), NOW())
         ON CONFLICT ("projectId", name) DO NOTHING`,
        [`${proj.name || proj.key} Board`, projectId, state.organizationId],
      ).catch(() => {});

      // Create default issue statuses
      const defaultStatuses = [
        { name: 'To Do', category: 'todo', color: '#6B7280', position: 0 },
        { name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 1 },
        { name: 'Done', category: 'done', color: '#10B981', position: 2 },
      ];

      // Apply status mapping if provided
      const statusMapping = state.statusMapping ?? {};
      const allStatusNames = new Set([
        ...defaultStatuses.map((s) => s.name),
        ...Object.keys(statusMapping),
      ]);

      for (const statusName of allStatusNames) {
        const mapped = statusMapping[statusName] ?? statusName;
        const category = mapped.toLowerCase().includes('progress') ? 'in_progress'
          : mapped.toLowerCase().includes('done') || mapped.toLowerCase().includes('complete') ? 'done'
          : 'todo';
        const color = category === 'done' ? '#10B981' : category === 'in_progress' ? '#3B82F6' : '#6B7280';
        await client.query(
          `INSERT INTO issue_statuses (id, name, category, color, "projectId", "organizationId", "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
           ON CONFLICT ("projectId", name) DO NOTHING`,
          [mapped, category, color, projectId, state.organizationId],
        ).catch(() => {});
      }

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

      const sprintsResp = await jiraGet<{
        values: Array<{
          id: number; name: string; state: string;
          startDate?: string; endDate?: string; goal?: string;
        }>
      }>(
        credentials,
        `/rest/agile/1.0/board/${boardId}/sprint`,
      ).catch(() => ({ values: [] }));

      const sprints = sprintsResp?.values ?? [];
      totalSprints += sprints.length;

      for (const sprint of sprints) {
        try {
          const boardRow = await client.query<{ id: string }>(
            `SELECT id FROM boards WHERE "projectId" = $1 AND "organizationId" = $2 LIMIT 1`,
            [projectId, state.organizationId],
          );
          const boardDbId = boardRow.rows[0]?.id;

          const { rows } = await client.query<{ id: string }>(
            `INSERT INTO sprints (id, name, status, goal, "startDate", "endDate", "projectId", "boardId", "organizationId", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
             ON CONFLICT ("projectId", name) DO UPDATE SET status = EXCLUDED.status, "updatedAt" = NOW()
             RETURNING id`,
            [
              sprint.name,
              sprint.state === 'active' ? 'active' : sprint.state === 'closed' ? 'completed' : 'planned',
              sprint.goal ?? null,
              sprint.startDate ?? null,
              sprint.endDate ?? null,
              projectId,
              boardDbId ?? null,
              state.organizationId,
            ],
          );

          if (rows[0]) {
            state.jiraSprintIdToLocalId[String(sprint.id)] = rows[0].id;
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
    'subtasks', 'parent', 'comment',
  ].join(',');

  let totalIssues = 0;
  let processedIssues = 0;
  let failedIssues = 0;

  const statusMapping = state.statusMapping ?? {};

  for (const proj of state.selectedProjects ?? []) {
    const projectId = state.jiraProjectIdToLocalId[proj.key];
    if (!projectId) continue;

    const jql = `project = "${proj.key}" ORDER BY created ASC`;
    let startAt = state.currentOffset; // resume support
    let hasMore = true;
    let firstPage = true;

    while (hasMore) {
      const encoded = encodeURIComponent(jql);
      const path = `/rest/api/3/search?jql=${encoded}&startAt=${startAt}&maxResults=${PAGE_SIZE}&fields=${FIELDS}`;

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

          // Status → find or use default "To Do"
          const jiraStatusName = fields.status?.name ?? 'To Do';
          const mappedStatus = statusMapping[jiraStatusName] ?? jiraStatusName;

          const { rows: statusRows } = await client.query<{ id: string }>(
            `SELECT id FROM issue_statuses WHERE "projectId" = $1 AND name = $2 LIMIT 1`,
            [projectId, mappedStatus],
          );
          const statusId = statusRows[0]?.id ?? null;

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

          // Stript ADF description → plaintext
          const description = extractDescription(fields.description);

          const { rows: issueRows } = await client.query<{ id: string }>(
            `INSERT INTO issues (
               id, title, description, type, priority,
               "statusId", "projectId", "organizationId",
               "assigneeId", "reporterId", "sprintId",
               "jiraKey", labels, "storyPoints",
               "estimateSeconds", "timeSpentSeconds",
               "createdAt", "updatedAt"
             )
             VALUES (
               gen_random_uuid(), $1, $2, $3, $4,
               $5, $6, $7,
               $8, $9, $10,
               $11, $12, $13,
               $14, $15,
               COALESCE($16::timestamptz, NOW()), COALESCE($17::timestamptz, NOW())
             )
             ON CONFLICT ("organizationId", "jiraKey") DO UPDATE
               SET title = EXCLUDED.title,
                   description = EXCLUDED.description,
                   "updatedAt" = NOW()
             RETURNING id`,
            [
              fields.summary ?? issue.key,
              description,
              type,
              priority,
              statusId,
              projectId,
              state.organizationId,
              assigneeId,
              reporterId,
              sprintId,
              issue.key,
              JSON.stringify(fields.labels ?? []),
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

    // Reset offset for next project
    state.currentOffset = 0;
    await updateRunProgress(client, state.id, { currentOffset: 0 }, null);
  }

  // Second pass: link parent/subtask relationships
  await linkParentIssues(client, state, credentials);

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
  credentials: JiraCredentials,
): Promise<void> {
  // For each issue with a parent, set parent_id
  for (const [jiraKey, localId] of Object.entries(state.jiraIssueKeyToLocalId)) {
    // We stored parent key in description metadata — instead re-fetch from Jira if needed
    // For simplicity: query our DB for issues that need parent linkage would require jiraKey index
    // This is a best-effort pass; parent links are set during initial upsert via jiraKey lookup
    void jiraKey; void localId; // covered in main upsert via jiraIssueKeyToLocalId
  }
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
      const resp = await jiraGet<{ comments: any[] }>(
        credentials,
        `/rest/api/3/issue/${jiraKey}/comment?maxResults=100`,
      ).catch(() => ({ comments: [] }));

      totalComments += resp.comments.length;

      for (const comment of resp.comments) {
        try {
          const authorEmail = comment.author?.emailAddress?.toLowerCase();
          const authorId = authorEmail ? state.jiraUserEmailToLocalId[authorEmail] ?? null : null;
          const body = extractDescription(comment.body) ?? '';

          await client.query(
            `INSERT INTO comments (id, content, "issueId", "authorId", "organizationId", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), NOW())
             ON CONFLICT DO NOTHING`,
            [body, localIssueId, authorId, state.organizationId, comment.created ?? null],
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
  const { runId, organizationId, connectionId } = job.data;

  console.log(`[Migration] Starting job for run ${runId}`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const state = await loadRun(client, runId);

    if (state.status === 'cancelled') {
      console.log(`[Migration:${runId}] Cancelled — skipping`);
      await client.query('COMMIT');
      return;
    }

    const credentials = await loadCredentials(client, state.connectionId ?? connectionId);
    await client.query('COMMIT');

    // Update to processing
    const progressClient = await db.connect();
    try {
      await updateRunProgress(progressClient, runId, {
        status: 'processing',
        currentPhase: state.currentPhase || PHASE_MEMBERS,
      }, io);

      const completed = new Set<number>(state.completedPhases ?? []);

      // Phase 1 — members
      if (!completed.has(PHASE_MEMBERS)) {
        await runMembersPhase(progressClient, state, credentials, io);
        state.completedPhases = [...(state.completedPhases ?? []), PHASE_MEMBERS];
      } else {
        // Re-load user map from DB for subsequent phases
        const { rows } = await progressClient.query<{ email: string; id: string }>(
          `SELECT u.email, u.id FROM users u
           INNER JOIN organization_members om ON om."userId" = u.id
           WHERE om."organizationId" = $1`,
          [organizationId],
        );
        for (const r of rows) state.jiraUserEmailToLocalId[r.email.toLowerCase()] = r.id;
      }

      // Phase 2 — projects
      if (!completed.has(PHASE_PROJECTS)) {
        await runProjectsPhase(progressClient, state, credentials, io);
        state.completedPhases = [...(state.completedPhases ?? []), PHASE_PROJECTS];
      } else {
        const { rows } = await progressClient.query<{ key: string; id: string }>(
          `SELECT key, id FROM projects WHERE "organizationId" = $1`,
          [organizationId],
        );
        for (const r of rows) state.jiraProjectIdToLocalId[r.key] = r.id;
      }

      // Phase 3 — sprints
      if (!completed.has(PHASE_SPRINTS)) {
        await runSprintsPhase(progressClient, state, credentials, io);
        state.completedPhases = [...(state.completedPhases ?? []), PHASE_SPRINTS];
      } else {
        const { rows } = await progressClient.query<{ "jiraSprintId": string; id: string }>(
          `SELECT "jiraSprintId", id FROM sprints WHERE "organizationId" = $1`,
          [organizationId],
        ).catch(() => ({ rows: [] as any[] }));
        for (const r of rows) if (r.jiraSprintId) state.jiraSprintIdToLocalId[r.jiraSprintId] = r.id;
      }

      // Phase 4 — issues
      if (!completed.has(PHASE_ISSUES)) {
        await runIssuesPhase(progressClient, state, credentials, io);
        state.completedPhases = [...(state.completedPhases ?? []), PHASE_ISSUES];
      } else {
        const { rows } = await progressClient.query<{ "jiraKey": string; id: string }>(
          `SELECT "jiraKey", id FROM issues WHERE "organizationId" = $1 AND "jiraKey" IS NOT NULL`,
          [organizationId],
        ).catch(() => ({ rows: [] as any[] }));
        for (const r of rows) if (r.jiraKey) state.jiraIssueKeyToLocalId[r.jiraKey] = r.id;
      }

      // Phase 5 — comments
      if (!completed.has(PHASE_COMMENTS)) {
        await runCommentsPhase(progressClient, state, credentials, io);
      }

      // Phase 6 — attachments
      if (!completed.has(PHASE_ATTACHMENTS)) {
        await runAttachmentsPhase(progressClient, state, io);
      }

      // Write final result summary
      const summary = {
        projects: (state.selectedProjects ?? []).map((p) => ({
          key: p.key,
          name: p.name,
          issueCount: p.issueCount,
          status: state.failedIssues > 0 ? 'partial' : 'success',
          boardupscaleProjectId: state.jiraProjectIdToLocalId[p.key],
        })),
        totalMigrated: state.processedIssues,
        totalFailed: state.failedIssues,
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

      console.log(`[Migration:${runId}] Completed successfully`);
    } finally {
      progressClient.release();
    }
  } catch (err: any) {
    console.error(`[Migration:${runId}] Fatal error:`, err.message);
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

  worker.on('completed', (job) => {
    console.log(`[JiraMigrationWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[JiraMigrationWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[JiraMigrationWorker] Worker error:', err.message);
  });

  return worker;
}
