import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import { URL } from 'url';
import { createRedisConnection, redisConnection } from '../redis';
import { config } from '../config';

// ─── Types ──────────────────────────────────────────────────────────────────

interface JiraImportJobData {
  jobId: string;
  filePath: string;
  organizationId: string;
  userId: string;
  targetProjectId: string | null;
  userMapping: Record<string, string>;
}

interface ImportStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  errors: string[];
  startedAt?: string;
  completedAt?: string;
}

interface JiraIssue {
  key: string;
  fields: {
    summary?: string;
    description?: string;
    issuetype?: { name: string };
    priority?: { name: string };
    status?: {
      name: string;
      statusCategory?: { key: string };
    };
    assignee?: { emailAddress: string; displayName: string };
    reporter?: { emailAddress: string; displayName: string };
    created?: string;
    updated?: string;
    labels?: string[];
    components?: Array<{ name: string }>;
    fixVersions?: Array<{ name: string }>;
    customfield_10016?: number;
    timetracking?: {
      originalEstimate?: string;
      timeSpent?: string;
      originalEstimateSeconds?: number;
      timeSpentSeconds?: number;
    };
    subtasks?: Array<{ key: string }>;
    issuelinks?: Array<{
      type: { name: string; inward: string; outward: string };
      inwardIssue?: { key: string };
      outwardIssue?: { key: string };
    }>;
    comment?: {
      comments: Array<{
        author: { emailAddress: string; displayName: string };
        body: string;
        created: string;
      }>;
    };
    parent?: { key: string };
    [key: string]: any;
  };
}

interface JiraExport {
  projects?: Array<{ key: string; name: string; description?: string }>;
  issues?: JiraIssue[];
}

// ─── Mapping helpers ────────────────────────────────────────────────────────

const ISSUE_TYPE_MAP: Record<string, string> = {
  story: 'story',
  task: 'task',
  bug: 'bug',
  epic: 'epic',
  subtask: 'subtask',
  'sub-task': 'subtask',
  'new feature': 'story',
  improvement: 'story',
  'technical task': 'task',
  // Custom issue types discovered in codeupscale.atlassian.net projects
  're-opened': 'bug',   // ILG project — treated as a re-opened bug
  heartbeat: 'task',    // PCGAD project — recurring check-in task
};

const PRIORITY_MAP: Record<string, string> = {
  highest: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  lowest: 'low',
  blocker: 'critical',
  critical: 'critical',
  major: 'high',
  minor: 'low',
  trivial: 'low',
};

const STATUS_CATEGORY_MAP: Record<string, string> = {
  new: 'todo',
  undefined: 'todo',
  indeterminate: 'in_progress',
  done: 'done',
};

const STATUS_CATEGORY_COLORS: Record<string, string> = {
  todo: '#6B7280',
  in_progress: '#3B82F6',
  done: '#10B981',
};

function mapIssueType(name: string | undefined): string {
  if (!name) return 'task';
  const key = name.toLowerCase().trim();
  return ISSUE_TYPE_MAP[key] || 'task';
}

function mapPriority(name: string | undefined): string {
  if (!name) return 'medium';
  const key = name.toLowerCase().trim();
  return PRIORITY_MAP[key] || 'medium';
}

function mapStatusCategory(categoryKey: string | undefined): string {
  if (!categoryKey) return 'todo';
  const key = categoryKey.toLowerCase().trim();
  return STATUS_CATEGORY_MAP[key] || 'todo';
}

function parseTimeToSeconds(timeStr: string | undefined | null): number | null {
  if (!timeStr) return null;
  let total = 0;
  const d = timeStr.match(/(\d+)\s*d/);
  const h = timeStr.match(/(\d+)\s*h/);
  const m = timeStr.match(/(\d+)\s*m/);
  if (d) total += parseInt(d[1], 10) * 8 * 3600;
  if (h) total += parseInt(h[1], 10) * 3600;
  if (m) total += parseInt(m[1], 10) * 60;
  return total > 0 ? total : null;
}

// ─── Status update helper ───────────────────────────────────────────────────

async function updateStatus(
  jobId: string,
  update: Partial<ImportStatus>,
): Promise<void> {
  try {
    const key = `import:${jobId}`;
    const raw = await redisConnection.get(key);
    const current: ImportStatus = raw
      ? JSON.parse(raw)
      : { status: 'pending', total: 0, processed: 0, errors: [] };

    const merged = { ...current, ...update };
    if (update.errors) {
      merged.errors = [...(current.errors || []), ...update.errors];
    }

    await redisConnection.set(key, JSON.stringify(merged), 'EX', 86400);
  } catch (err: any) {
    console.error(`[ImportWorker] Failed to update status in Redis: ${err.message}`);
  }
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

/**
 * Bulk-add every user that appeared as assignee/reporter into project_members
 * so the project is visible to them and their names resolve in the UI.
 * The triggering user was already inserted as admin; everyone else gets 'member'.
 * Uses ON CONFLICT DO NOTHING so re-imports are safe.
 */
async function ensureProjectMemberships(
  db: Pool,
  projectId: string,
  userIds: Set<string>,
): Promise<void> {
  if (userIds.size === 0) return;
  let added = 0;
  for (const uid of userIds) {
    try {
      await db.query(
        `INSERT INTO project_members (project_id, user_id, role, created_at)
         VALUES ($1, $2, 'member', NOW())
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [projectId, uid],
      );
      added++;
    } catch {}
  }
  console.log(`[ImportWorker] Ensured ${added} additional project member(s) for project ${projectId}`);
}

// ─── Core import logic ──────────────────────────────────────────────────────

async function processJiraImport(job: Job, db: Pool): Promise<void> {
  const data = job.data as JiraImportJobData;
  const { jobId, filePath, organizationId, userId, targetProjectId, userMapping } = data;

  console.log(`[ImportWorker] Starting import job ${jobId} for org ${organizationId}`);

  await updateStatus(jobId, { status: 'processing' });

  // ── 1. Read and parse the file ────────────────────────────────────────────
  let jiraData: JiraExport;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    jiraData = JSON.parse(raw);
  } catch (err: any) {
    await updateStatus(jobId, {
      status: 'failed',
      errors: [`Failed to read/parse file: ${err.message}`],
      completedAt: new Date().toISOString(),
    });
    return;
  }

  if (!jiraData.issues || jiraData.issues.length === 0) {
    await updateStatus(jobId, {
      status: 'completed',
      total: 0,
      processed: 0,
      completedAt: new Date().toISOString(),
    });
    return;
  }

  const totalIssues = jiraData.issues.length;
  await updateStatus(jobId, { total: totalIssues });

  // ── 2. Build user mapping (email -> userId) ───────────────────────────────
  const emailToUserId: Record<string, string> = {};

  // First, load all org users for auto-matching
  try {
    const usersResult = await db.query(
      'SELECT id, email FROM users WHERE organization_id = $1 AND is_active = true',
      [organizationId],
    );
    for (const row of usersResult.rows) {
      emailToUserId[row.email.toLowerCase()] = row.id;
    }
  } catch (err: any) {
    console.warn(`[ImportWorker] Failed to load org users: ${err.message}`);
  }

  // Apply explicit user mapping overrides
  if (userMapping) {
    for (const [email, pfUserId] of Object.entries(userMapping)) {
      emailToUserId[email.toLowerCase()] = pfUserId;
    }
  }

  // ── 3. Determine or create the target project ────────────────────────────
  let projectId = targetProjectId;
  let projectKey: string;

  if (projectId) {
    // Use existing project
    const projResult = await db.query(
      'SELECT id, key FROM projects WHERE id = $1 AND organization_id = $2',
      [projectId, organizationId],
    );
    if (projResult.rows.length === 0) {
      await updateStatus(jobId, {
        status: 'failed',
        errors: [`Target project ${projectId} not found in this organization`],
        completedAt: new Date().toISOString(),
      });
      return;
    }
    projectKey = projResult.rows[0].key;
  } else {
    // Create a new project from the first Jira project (or infer from issue keys)
    const jiraProject = jiraData.projects?.[0];
    const inferredKey =
      jiraProject?.key ||
      jiraData.issues[0]?.key?.split('-')[0] ||
      'IMPORT';
    const projectName = jiraProject?.name || `Imported - ${inferredKey}`;
    const projectDesc = jiraProject?.description || 'Imported from Jira';

    // Check if a project with this key already exists
    const existingProj = await db.query(
      'SELECT id, key FROM projects WHERE key = $1 AND organization_id = $2',
      [inferredKey, organizationId],
    );

    if (existingProj.rows.length > 0) {
      projectId = existingProj.rows[0].id;
      projectKey = existingProj.rows[0].key;
      console.log(`[ImportWorker] Using existing project ${projectKey} (${projectId})`);
    } else {
      const insertResult = await db.query(
        `INSERT INTO projects (organization_id, name, key, description, type, status, owner_id, next_issue_number, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'scrum', 'active', $5, 1, NOW(), NOW())
         RETURNING id, key`,
        [organizationId, projectName, inferredKey, projectDesc, userId],
      );
      projectId = insertResult.rows[0].id;
      projectKey = insertResult.rows[0].key;
      console.log(`[ImportWorker] Created project ${projectKey} (${projectId})`);
    }
  }

  // Importing user must be in project_members or the project won't appear in the UI.
  try {
    await db.query(
      `INSERT INTO project_members (project_id, user_id, role, created_at)
       VALUES ($1, $2, 'admin', NOW())
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [projectId, userId],
    );
  } catch (memErr: any) {
    console.warn(`[ImportWorker] Could not ensure project membership: ${memErr.message}`);
  }

  // ── 4. Create issue statuses based on Jira statuses ──────────────────────
  const statusNameToId: Record<string, string> = {};

  // Load existing statuses for this project
  const existingStatuses = await db.query(
    'SELECT id, name FROM issue_statuses WHERE project_id = $1',
    [projectId],
  );
  for (const row of existingStatuses.rows) {
    statusNameToId[row.name.toLowerCase()] = row.id;
  }

  // Extract unique Jira statuses and create missing ones
  const jiraStatusMap = new Map<
    string,
    { category: string; color: string }
  >();
  for (const issue of jiraData.issues) {
    const statusName = issue.fields?.status?.name;
    if (statusName && !jiraStatusMap.has(statusName)) {
      const catKey = issue.fields.status?.statusCategory?.key;
      const category = mapStatusCategory(catKey);
      jiraStatusMap.set(statusName, {
        category,
        color: STATUS_CATEGORY_COLORS[category] || '#6B7280',
      });
    }
  }

  let statusPosition = existingStatuses.rows.length;
  for (const [name, { category, color }] of jiraStatusMap.entries()) {
    if (!statusNameToId[name.toLowerCase()]) {
      try {
        const isDefault = statusPosition === 0;
        const result = await db.query(
          `INSERT INTO issue_statuses (project_id, name, category, color, position, is_default, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           RETURNING id`,
          [projectId, name, category, color, statusPosition, isDefault],
        );
        statusNameToId[name.toLowerCase()] = result.rows[0].id;
        statusPosition++;
      } catch (err: any) {
        console.warn(`[ImportWorker] Failed to create status "${name}": ${err.message}`);
      }
    }
  }

  // Ensure we have at least a default status
  let defaultStatusId: string | null = null;
  if (Object.keys(statusNameToId).length > 0) {
    defaultStatusId = Object.values(statusNameToId)[0];
  } else {
    // Create a default "To Do" status
    const result = await db.query(
      `INSERT INTO issue_statuses (project_id, name, category, color, position, is_default, created_at, updated_at)
       VALUES ($1, 'To Do', 'todo', '#6B7280', 0, true, NOW(), NOW())
       RETURNING id`,
      [projectId],
    );
    defaultStatusId = result.rows[0].id;
    statusNameToId['to do'] = defaultStatusId;
  }

  // ── 5. Import issues in batches of 50 ────────────────────────────────────
  const BATCH_SIZE = 50;
  let processed = 0;
  const errors: string[] = [];
  // Map Jira key -> Boardupscale issue ID (for parent/subtask linking)
  const jiraKeyToIssueId: Record<string, string> = {};
  // Collect every org-user ID referenced as assignee/reporter so we can add
  // them all to project_members at the end (Gap 1 fix).
  const usedUserIds = new Set<string>();

  for (let i = 0; i < jiraData.issues.length; i += BATCH_SIZE) {
    const batch = jiraData.issues.slice(i, i + BATCH_SIZE);

    for (const jiraIssue of batch) {
      try {
        const fields = jiraIssue.fields || {};

        // Map fields
        const isSubtask =
          fields.issuetype?.name?.toLowerCase() === 'sub-task' ||
          fields.issuetype?.name?.toLowerCase() === 'subtask';
        const type = isSubtask
          ? 'subtask'
          : mapIssueType(fields.issuetype?.name);
        const priority = mapPriority(fields.priority?.name);
        const statusName = fields.status?.name || 'To Do';
        const statusId =
          statusNameToId[statusName.toLowerCase()] || defaultStatusId;

        // Map users
        const assigneeEmail = fields.assignee?.emailAddress?.toLowerCase();
        const reporterEmail = fields.reporter?.emailAddress?.toLowerCase();
        const assigneeId = assigneeEmail
          ? emailToUserId[assigneeEmail] || null
          : null;
        const reporterId = reporterEmail
          ? emailToUserId[reporterEmail] || userId
          : userId;

        // Track every matched user so we can add them to project_members later
        if (assigneeId) usedUserIds.add(assigneeId);
        if (reporterId) usedUserIds.add(reporterId);

        // Story points
        const storyPoints =
          typeof fields.customfield_10016 === 'number'
            ? fields.customfield_10016
            : null;

        // Time tracking
        const timeEstimate =
          fields.timetracking?.originalEstimateSeconds != null
            ? fields.timetracking.originalEstimateSeconds
            : parseTimeToSeconds(fields.timetracking?.originalEstimate);
        const timeSpent =
          fields.timetracking?.timeSpentSeconds != null
            ? fields.timetracking.timeSpentSeconds
            : parseTimeToSeconds(fields.timetracking?.timeSpent) || 0;

        // Labels
        const labels = Array.isArray(fields.labels) ? fields.labels : [];

        // Description
        const description = fields.description || null;

        // Get next issue number atomically
        const numResult = await db.query(
          `UPDATE projects SET next_issue_number = next_issue_number + 1, updated_at = NOW()
           WHERE id = $1
           RETURNING next_issue_number - 1 AS issue_number`,
          [projectId],
        );
        const issueNumber = numResult.rows[0].issue_number;
        const issueKey = `${projectKey}-${issueNumber}`;

        // Determine timestamps
        const createdAt = fields.created
          ? new Date(fields.created)
          : new Date();
        const updatedAt = fields.updated
          ? new Date(fields.updated)
          : createdAt;

        // Insert the issue
        const issueResult = await db.query(
          `INSERT INTO issues (
            organization_id, project_id, status_id, reporter_id, assignee_id,
            "number", key, title, description, type, priority,
            story_points, time_estimate, time_spent, labels, position,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          RETURNING id`,
          [
            organizationId,
            projectId,
            statusId,
            reporterId,
            assigneeId,
            issueNumber,
            issueKey,
            fields.summary || jiraIssue.key,
            description,
            type,
            priority,
            storyPoints,
            timeEstimate,
            timeSpent,
            labels,
            issueNumber, // position
            createdAt,
            updatedAt,
          ],
        );

        const issueId = issueResult.rows[0].id;
        jiraKeyToIssueId[jiraIssue.key] = issueId;

        // Insert comments
        if (fields.comment?.comments && fields.comment.comments.length > 0) {
          for (const comment of fields.comment.comments) {
            try {
              const commentAuthorEmail =
                comment.author?.emailAddress?.toLowerCase();
              const commentAuthorId = commentAuthorEmail
                ? emailToUserId[commentAuthorEmail] || userId
                : userId;
              const commentCreatedAt = comment.created
                ? new Date(comment.created)
                : new Date();

              await db.query(
                `INSERT INTO comments (issue_id, author_id, content, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $4)`,
                [issueId, commentAuthorId, comment.body || '', commentCreatedAt],
              );
            } catch (commentErr: any) {
              console.warn(
                `[ImportWorker] Failed to import comment for ${jiraIssue.key}: ${commentErr.message}`,
              );
            }
          }
        }

        processed++;
      } catch (issueErr: any) {
        const errorMsg = `Failed to import issue ${jiraIssue.key}: ${issueErr.message}`;
        console.error(`[ImportWorker] ${errorMsg}`);
        errors.push(errorMsg);
        processed++;
      }
    }

    // Update progress after each batch
    await updateStatus(jobId, {
      processed,
      errors: errors.length > 0 ? errors.slice(-10) : [], // Keep last 10 errors
    });

    console.log(
      `[ImportWorker] Progress: ${processed}/${totalIssues} (${errors.length} errors)`,
    );
  }

  // ── 6. Link parent/subtask relationships ──────────────────────────────────
  console.log('[ImportWorker] Linking parent/subtask relationships...');
  let linksCreated = 0;

  for (const jiraIssue of jiraData.issues) {
    const parentKey = jiraIssue.fields?.parent?.key;
    if (parentKey && jiraKeyToIssueId[jiraIssue.key] && jiraKeyToIssueId[parentKey]) {
      try {
        await db.query(
          'UPDATE issues SET parent_id = $1 WHERE id = $2',
          [jiraKeyToIssueId[parentKey], jiraKeyToIssueId[jiraIssue.key]],
        );
        linksCreated++;
      } catch (err: any) {
        console.warn(
          `[ImportWorker] Failed to link ${jiraIssue.key} to parent ${parentKey}: ${err.message}`,
        );
      }
    }
  }

  console.log(`[ImportWorker] Created ${linksCreated} parent/subtask links`);

  // ── 6b. Add all referenced users as project members ───────────────────────
  await ensureProjectMemberships(db, projectId, usedUserIds);

  // ── 7. Finalize ──────────────────────────────────────────────────────────
  const finalStatus: Partial<ImportStatus> = {
    status: errors.length > 0 && processed === errors.length ? 'failed' : 'completed',
    total: totalIssues,
    processed,
    completedAt: new Date().toISOString(),
  };

  // Only include last 50 errors in final status
  if (errors.length > 0) {
    finalStatus.errors = errors.slice(-50);
  }

  await updateStatus(jobId, finalStatus);

  // Clean up the uploaded file
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err: any) {
    console.warn(`[ImportWorker] Failed to clean up file ${filePath}: ${err.message}`);
  }

  console.log(
    `[ImportWorker] Import job ${jobId} completed: ${processed}/${totalIssues} issues, ${errors.length} errors`,
  );
}

// ─── Live Jira API import ────────────────────────────────────────────────────

interface JiraApiImportJobData {
  jobId: string;
  organizationId: string;
  userId: string;
  connectionId: string;
  projectKeys: string[];
  targetProjectId: string | null;
  userMapping: Record<string, string>;
}

interface JiraApiIssueFromApi {
  id: string;
  key: string;
  fields: {
    summary?: string;
    description?: any;
    issuetype?: { name: string };
    priority?: { name: string };
    status?: { name: string; statusCategory?: { key: string } };
    assignee?: { emailAddress?: string; displayName?: string };
    reporter?: { emailAddress?: string; displayName?: string };
    created?: string;
    updated?: string;
    labels?: string[];
    customfield_10016?: number;
    customfield_10020?: Array<{ id: number; name: string; state: string; startDate?: string; endDate?: string; goal?: string }>;
    timetracking?: { originalEstimate?: string; timeSpent?: string; originalEstimateSeconds?: number; timeSpentSeconds?: number };
    subtasks?: Array<{ id: string; key: string }>;
    parent?: { id: string; key: string };
    comment?: { comments: Array<{ author?: { emailAddress?: string; displayName?: string }; body?: any; created?: string }> };
  };
}

// ─── AES-256-GCM decrypt (mirrors API's crypto.util.ts) ─────────────────────

function decryptApiToken(encoded: string, secret: string): string {
  const IV_LENGTH = 16;
  const TAG_LENGTH = 16;
  const key = crypto.createHash('sha256').update(secret).digest();
  const packed = Buffer.from(encoded, 'base64');
  if (packed.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted Jira token: too short');
  }
  const iv = packed.slice(0, IV_LENGTH);
  const tag = packed.slice(packed.length - TAG_LENGTH);
  const ciphertext = packed.slice(IV_LENGTH, packed.length - TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

// ─── Minimal Jira REST API v3 client ────────────────────────────────────────

async function jiraGet<T>(baseUrl: string, email: string, apiToken: string, path: string): Promise<T> {
  const token = Buffer.from(`${email}:${apiToken}`).toString('base64');
  const rawUrl = baseUrl.replace(/\/$/, '') + path;
  const parsedUrl = new URL(rawUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const transport = isHttps ? https : http;
  const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : isHttps ? 443 : 80;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        hostname: parsedUrl.hostname,
        port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          Authorization: `Basic ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () => {
          if (res.statusCode === 429) {
            // Rate limited — wait and retry once
            setTimeout(() => {
              jiraGet<T>(baseUrl, email, apiToken, path).then(resolve).catch(reject);
            }, 3000);
            return;
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Jira API ${res.statusCode} on ${path}: ${body.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(body) as T);
          } catch {
            reject(new Error(`Jira API non-JSON response: ${body.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Jira API timeout (20s)')); });
    req.end();
  });
}

async function fetchAllIssuesByJql(
  baseUrl: string,
  email: string,
  apiToken: string,
  jql: string,
  onProgress?: (fetched: number, total: number) => void,
): Promise<JiraApiIssueFromApi[]> {
  const PAGE_SIZE = 100;
  const FIELDS = [
    'summary', 'description', 'issuetype', 'priority', 'status',
    'assignee', 'reporter', 'created', 'updated', 'labels',
    'customfield_10016', 'customfield_10020', 'timetracking',
    'subtasks', 'parent', 'comment',
  ].join(',');

  const issues: JiraApiIssueFromApi[] = [];
  let startAt = 0;
  let total = 0;

  do {
    const encoded = encodeURIComponent(jql);
    const path = `/rest/api/3/search?jql=${encoded}&startAt=${startAt}&maxResults=${PAGE_SIZE}&fields=${FIELDS}`;
    const page = await jiraGet<{ total: number; issues?: JiraApiIssueFromApi[] }>(baseUrl, email, apiToken, path);
    total = page.total ?? 0;
    if (Array.isArray(page.issues)) {
      issues.push(...page.issues);
    }
    startAt += PAGE_SIZE;
    if (onProgress) onProgress(issues.length, total);
    if (issues.length < total) {
      await new Promise((r) => setTimeout(r, 100));
    }
  } while (issues.length < total);

  return issues;
}

// ─── ADF → plain text (mirrors API's JiraApiService.extractDescriptionText) ──

function adfToText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  if (!Array.isArray(node.content)) return '';
  const parts: string[] = node.content.map((c: any) => adfToText(c));
  switch (node.type) {
    case 'paragraph': return parts.join('') + '\n';
    case 'heading': return parts.join('') + '\n';
    case 'bulletList': case 'orderedList': return parts.join('');
    case 'listItem': return '- ' + parts.join('').trim() + '\n';
    case 'codeBlock': return '```\n' + parts.join('') + '```\n';
    case 'blockquote': return '> ' + parts.join('');
    case 'hardBreak': return '\n';
    default: return parts.join('');
  }
}

function extractDescriptionText(description: any): string | null {
  if (!description) return null;
  if (typeof description === 'string') return description || null;
  if (description.type === 'doc' && Array.isArray(description.content)) {
    return adfToText(description) || null;
  }
  return null;
}

// ─── Redis helpers for API import jobs ───────────────────────────────────────

interface ApiImportStatus {
  status: string;
  total: number;
  processed: number;
  failed: number;
  errors: string[];
  startedAt?: string;
  completedAt?: string;
  source: string;
}

async function updateApiJobStatus(jobId: string, update: Partial<ApiImportStatus>): Promise<void> {
  try {
    const key = `import:${jobId}`;
    const raw = await redisConnection.get(key);
    const current: ApiImportStatus = raw
      ? JSON.parse(raw)
      : { status: 'processing', total: 0, processed: 0, failed: 0, errors: [], source: 'api' };
    const merged: ApiImportStatus = { ...current, ...update };
    if (update.errors && update.errors.length > 0) {
      merged.errors = [...(current.errors || []), ...update.errors].slice(-100);
    }
    await redisConnection.set(key, JSON.stringify(merged), 'EX', 86400);
  } catch (err: any) {
    console.error(`[ImportWorker] Redis status update failed for api job ${jobId}: ${err.message}`);
  }
}

async function updateApiJobDb(
  db: Pool,
  jobId: string,
  organizationId: string,
  update: {
    status?: string;
    totalIssues?: number;
    processedIssues?: number;
    failedIssues?: number;
    errorLog?: string[];
    projectId?: string;
    startedAt?: Date;
    completedAt?: Date;
  },
): Promise<void> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const values: any[] = [];
  let idx = 1;

  if (update.status !== undefined)          { setClauses.push(`status = $${idx++}`);            values.push(update.status); }
  if (update.totalIssues !== undefined)     { setClauses.push(`total_issues = $${idx++}`);       values.push(update.totalIssues); }
  if (update.processedIssues !== undefined) { setClauses.push(`processed_issues = $${idx++}`);   values.push(update.processedIssues); }
  if (update.failedIssues !== undefined)    { setClauses.push(`failed_issues = $${idx++}`);      values.push(update.failedIssues); }
  if (update.errorLog !== undefined)        { setClauses.push(`error_log = $${idx++}`);          values.push(JSON.stringify(update.errorLog)); }
  if (update.projectId !== undefined)       { setClauses.push(`project_id = $${idx++}`);         values.push(update.projectId); }
  if (update.startedAt !== undefined)       { setClauses.push(`started_at = $${idx++}`);         values.push(update.startedAt); }
  if (update.completedAt !== undefined)     { setClauses.push(`completed_at = $${idx++}`);       values.push(update.completedAt); }

  if (values.length === 0) return;

  values.push(jobId, organizationId);
  await db.query(
    `UPDATE jira_import_jobs SET ${setClauses.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx}`,
    values,
  );
}

// ─── Jira org-user fetch + DB upsert ────────────────────────────────────────

/**
 * Fetch all users from the Jira organisation via /rest/api/3/users/search
 * (action=browse-equivalent: returns all active Atlassian account users).
 * Paginates 50 at a time.
 */
async function fetchJiraOrgUsers(
  jiraUrl: string,
  email: string,
  apiToken: string,
): Promise<Array<{ accountId: string; emailAddress?: string; displayName?: string }>> {
  const PAGE_SIZE = 50;
  const users: Array<{ accountId: string; emailAddress?: string; displayName?: string }> = [];
  let startAt = 0;
  let hasMore = true;

  while (hasMore) {
    let page: Array<{ accountId: string; emailAddress?: string; displayName?: string; accountType?: string; active?: boolean }>;
    try {
      page = await jiraGet<Array<{ accountId: string; emailAddress?: string; displayName?: string; accountType?: string; active?: boolean }>>(
        jiraUrl, email, apiToken,
        `/rest/api/3/users/search?startAt=${startAt}&maxResults=${PAGE_SIZE}&includeInactive=false`,
      );
    } catch (err: any) {
      console.warn(`[ImportWorker] fetchJiraOrgUsers failed at startAt=${startAt}: ${err.message}`);
      break;
    }

    if (!Array.isArray(page) || page.length === 0) {
      hasMore = false;
      break;
    }

    // Only keep real human Atlassian accounts (skip apps and service accounts)
    for (const u of page) {
      if (u.accountType === 'atlassian' && u.emailAddress) {
        users.push({ accountId: u.accountId, emailAddress: u.emailAddress, displayName: u.displayName });
      }
    }

    hasMore = page.length === PAGE_SIZE;
    startAt += PAGE_SIZE;

    if (hasMore) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return users;
}

/**
 * Upsert Jira users into the Boardupscale users table as inactive placeholder
 * accounts so that assignee/reporter links resolve correctly.
 * Returns an updated email→userId map.
 */
async function upsertJiraUsersIntoDb(
  db: Pool,
  organizationId: string,
  jiraUsers: Array<{ accountId: string; emailAddress?: string; displayName?: string }>,
  existingMap: Record<string, string>,
): Promise<Record<string, string>> {
  const updatedMap = { ...existingMap };

  for (const u of jiraUsers) {
    if (!u.emailAddress) continue;
    const emailLower = u.emailAddress.toLowerCase();

    // Skip if already mapped
    if (updatedMap[emailLower]) continue;

    try {
      // Check if user already exists in the org (by email, any org)
      const existing = await db.query(
        `SELECT id FROM users WHERE email = $1 LIMIT 1`,
        [emailLower],
      );

      if (existing.rows.length > 0) {
        updatedMap[emailLower] = existing.rows[0].id;
        continue;
      }

      // Insert as a placeholder (jira-imported) user — not active, no password.
      // Column names match the InitialSchema migration: display_name, role, is_active.
      const displayName = u.displayName || emailLower;

      const inserted = await db.query(
        `INSERT INTO users (
           organization_id, email, display_name,
           role, is_active, email_verified, language,
           oauth_provider, oauth_id,
           notification_preferences,
           created_at, updated_at
         ) VALUES ($1, $2, $3, 'member', false, false, 'en', 'jira', $4,
                   '{"email":true,"inApp":true}'::jsonb, NOW(), NOW())
         ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [organizationId, emailLower, displayName, u.accountId],
      );

      if (inserted.rows.length > 0) {
        updatedMap[emailLower] = inserted.rows[0].id;
      }
    } catch (err: any) {
      console.warn(`[ImportWorker] Failed to upsert Jira user ${emailLower}: ${err.message}`);
    }
  }

  return updatedMap;
}

// ─── Core: live Jira API import ───────────────────────────────────────────────

async function processJiraApiImport(job: Job, db: Pool): Promise<void> {
  const data = job.data as JiraApiImportJobData;
  const { jobId, organizationId, userId, connectionId, projectKeys, targetProjectId, userMapping } = data;

  console.log(`[ImportWorker] Starting jira-api-import job ${jobId} for org ${organizationId} (projects: ${projectKeys.join(', ')})`);

  // ── 1. Mark job as processing ────────────────────────────────────────────────
  await updateApiJobStatus(jobId, { status: 'processing', startedAt: new Date().toISOString() });
  await updateApiJobDb(db, jobId, organizationId, { status: 'processing', startedAt: new Date() });

  // ── 2. Load + decrypt Jira credentials ──────────────────────────────────────
  const appSecret = config.appSecret;
  if (!appSecret) {
    const msg = 'APP_SECRET is not configured — cannot decrypt Jira API token';
    console.error(`[ImportWorker] ${msg}`);
    await updateApiJobStatus(jobId, { status: 'failed', errors: [msg], completedAt: new Date().toISOString() });
    await updateApiJobDb(db, jobId, organizationId, { status: 'failed', completedAt: new Date(), errorLog: [msg] });
    return;
  }

  let jiraUrl: string;
  let jiraEmail: string;
  let apiToken: string;

  try {
    const connResult = await db.query(
      `SELECT jira_url, jira_email, api_token_enc FROM jira_connections WHERE id = $1 AND organization_id = $2 AND is_active = true`,
      [connectionId, organizationId],
    );
    if (connResult.rows.length === 0) {
      throw new Error(`Active Jira connection ${connectionId} not found`);
    }
    jiraUrl = connResult.rows[0].jira_url;
    jiraEmail = connResult.rows[0].jira_email;
    apiToken = decryptApiToken(connResult.rows[0].api_token_enc, appSecret);
  } catch (err: any) {
    const msg = `Failed to load Jira credentials: ${err.message}`;
    console.error(`[ImportWorker] ${msg}`);
    await updateApiJobStatus(jobId, { status: 'failed', errors: [msg], completedAt: new Date().toISOString() });
    await updateApiJobDb(db, jobId, organizationId, { status: 'failed', completedAt: new Date(), errorLog: [msg] });
    return;
  }

  // ── 3. Build user email→userId map ───────────────────────────────────────────
  const emailToUserId: Record<string, string> = {};
  try {
    const usersResult = await db.query(
      'SELECT id, email FROM users WHERE organization_id = $1 AND is_active = true',
      [organizationId],
    );
    for (const row of usersResult.rows) {
      emailToUserId[row.email.toLowerCase()] = row.id;
    }
  } catch (err: any) {
    console.warn(`[ImportWorker] Could not load org users for mapping: ${err.message}`);
  }

  // Apply explicit overrides from the job payload
  for (const [email, bsUserId] of Object.entries(userMapping || {})) {
    emailToUserId[email.toLowerCase()] = bsUserId;
  }

  // ── 3b. Fetch all Jira org users and upsert as placeholder DB accounts ───────
  // This ensures assignee/reporter fields resolve to a real user ID even when the
  // Jira user has not yet signed up to Boardupscale. Fetches via action=browse
  // equivalent: /rest/api/3/users/search (all active Atlassian account users).
  console.log(`[ImportWorker] Fetching Jira org members to pre-populate user map...`);
  try {
    const jiraUsers = await fetchJiraOrgUsers(jiraUrl, jiraEmail, apiToken);
    console.log(`[ImportWorker] Found ${jiraUsers.length} Jira users — upserting into DB...`);
    const enrichedMap = await upsertJiraUsersIntoDb(db, organizationId, jiraUsers, emailToUserId);
    // Merge enriched map back (upsertJiraUsersIntoDb returns a copy with additions)
    for (const [email, uid] of Object.entries(enrichedMap)) {
      emailToUserId[email] = uid;
    }
    console.log(`[ImportWorker] User map now has ${Object.keys(emailToUserId).length} entries`);
  } catch (err: any) {
    // Non-fatal: if this step fails, fall back to known org users only
    console.warn(`[ImportWorker] Jira user pre-population failed (non-fatal): ${err.message}`);
  }

  // ── 4. Process each Jira project key ─────────────────────────────────────────
  let totalIssues = 0;
  let processedIssues = 0;
  let failedIssues = 0;
  const allErrors: string[] = [];

  for (const projectKey of projectKeys) {
    console.log(`[ImportWorker] Fetching issues for project ${projectKey} from Jira...`);

    // ── 4a. Fetch all issues for this project via JQL ───────────────────────
    let jiraIssues: JiraApiIssueFromApi[];
    try {
      jiraIssues = await fetchAllIssuesByJql(
        jiraUrl,
        jiraEmail,
        apiToken,
        `project = "${projectKey}" ORDER BY created ASC`,
        (fetched, total) => {
          console.log(`[ImportWorker]   ${projectKey}: fetched ${fetched}/${total} issues from Jira`);
        },
      );
    } catch (err: any) {
      const msg = `Failed to fetch issues for project ${projectKey}: ${err.message}`;
      console.error(`[ImportWorker] ${msg}`);
      allErrors.push(msg);
      await updateApiJobStatus(jobId, { errors: [msg] });
      continue;
    }

    if (jiraIssues.length === 0) {
      console.log(`[ImportWorker] No issues found for project ${projectKey} — skipping`);
      continue;
    }

    totalIssues += jiraIssues.length;
    await updateApiJobStatus(jobId, { total: totalIssues });
    await updateApiJobDb(db, jobId, organizationId, { totalIssues });

    // ── 4b. Fetch Jira project metadata ─────────────────────────────────────
    let jiraProjectName = projectKey;
    let jiraProjectDesc: string | null = null;
    try {
      const projData = await jiraGet<{ name?: string; description?: string }>(
        jiraUrl, jiraEmail, apiToken,
        `/rest/api/3/project/${projectKey}`,
      );
      jiraProjectName = projData.name || projectKey;
      jiraProjectDesc = projData.description || null;
    } catch {
      // Non-fatal — use key as name
    }

    // ── 4c. Determine target Boardupscale project ────────────────────────────
    let bsProjectId = targetProjectId;
    let bsProjectKey: string;

    if (bsProjectId) {
      const projResult = await db.query(
        'SELECT id, key FROM projects WHERE id = $1 AND organization_id = $2',
        [bsProjectId, organizationId],
      );
      if (projResult.rows.length === 0) {
        const msg = `Target project ${bsProjectId} not found in this organisation`;
        allErrors.push(msg);
        await updateApiJobStatus(jobId, { errors: [msg] });
        continue;
      }
      bsProjectKey = projResult.rows[0].key;
    } else {
      // Create or reuse a project with the same key as the Jira project
      const existingProj = await db.query(
        'SELECT id, key FROM projects WHERE key = $1 AND organization_id = $2',
        [projectKey, organizationId],
      );
      if (existingProj.rows.length > 0) {
        bsProjectId = existingProj.rows[0].id;
        bsProjectKey = existingProj.rows[0].key;
        console.log(`[ImportWorker]   Using existing project ${bsProjectKey} (${bsProjectId})`);
      } else {
        const insertResult = await db.query(
          `INSERT INTO projects (organization_id, name, key, description, type, status, owner_id, next_issue_number, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'scrum', 'active', $5, 1, NOW(), NOW())
           RETURNING id, key`,
          [organizationId, jiraProjectName, projectKey, jiraProjectDesc, userId],
        );
        bsProjectId = insertResult.rows[0].id;
        bsProjectKey = insertResult.rows[0].key;
        console.log(`[ImportWorker]   Created project ${bsProjectKey} (${bsProjectId})`);

        // Link job to the first created project
        await updateApiJobDb(db, jobId, organizationId, { projectId: bsProjectId });
      }
    }

    // Ensure the triggering user is a project member
    try {
      await db.query(
        `INSERT INTO project_members (project_id, user_id, role, created_at)
         VALUES ($1, $2, 'admin', NOW())
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [bsProjectId, userId],
      );
    } catch {}

    // ── 4d. Ensure issue statuses exist ─────────────────────────────────────
    const statusNameToId: Record<string, string> = {};
    const existingStatuses = await db.query(
      'SELECT id, name FROM issue_statuses WHERE project_id = $1',
      [bsProjectId],
    );
    for (const row of existingStatuses.rows) {
      statusNameToId[row.name.toLowerCase()] = row.id;
    }

    const jiraStatusMap = new Map<string, { category: string; color: string }>();
    for (const issue of jiraIssues) {
      const sName = issue.fields?.status?.name;
      if (sName && !jiraStatusMap.has(sName)) {
        const cat = mapStatusCategory(issue.fields.status?.statusCategory?.key);
        jiraStatusMap.set(sName, { category: cat, color: STATUS_CATEGORY_COLORS[cat] || '#6B7280' });
      }
    }

    let statusPos = existingStatuses.rows.length;
    for (const [name, { category, color }] of jiraStatusMap.entries()) {
      if (!statusNameToId[name.toLowerCase()]) {
        try {
          const r = await db.query(
            `INSERT INTO issue_statuses (project_id, name, category, color, position, is_default, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [bsProjectId, name, category, color, statusPos, statusPos === 0],
          );
          if (r.rows.length > 0) {
            statusNameToId[name.toLowerCase()] = r.rows[0].id;
          }
          statusPos++;
        } catch (err: any) {
          console.warn(`[ImportWorker]   Failed to create status "${name}": ${err.message}`);
        }
      }
    }

    // Ensure a fallback default status
    let defaultStatusId: string | null = Object.values(statusNameToId)[0] ?? null;
    if (!defaultStatusId) {
      try {
        const r = await db.query(
          `INSERT INTO issue_statuses (project_id, name, category, color, position, is_default, created_at, updated_at)
           VALUES ($1, 'To Do', 'todo', '#6B7280', 0, true, NOW(), NOW())
           RETURNING id`,
          [bsProjectId],
        );
        defaultStatusId = r.rows[0].id;
        statusNameToId['to do'] = defaultStatusId;
      } catch {}
    }

    // ── 4e. Import issues (upsert via jira_key) ──────────────────────────────
    const jiraKeyToBsId: Record<string, string> = {};
    // Tracks issues that exist in the DB but were soft-deleted (archived project).
    // On re-import we restore them and re-create their comments as fresh rows.
    const jiraKeyWasDeleted: Record<string, boolean> = {};
    // Collect every org-user ID referenced as assignee/reporter so we can add
    // them all to project_members at the end (Gap 1 fix).
    const usedUserIds = new Set<string>();

    // Pre-load any already-imported issues for this project (idempotency).
    // Include soft-deleted rows so a re-import after archive restores them.
    try {
      const existing = await db.query(
        'SELECT id, jira_key, deleted_at FROM issues WHERE project_id = $1 AND jira_key IS NOT NULL',
        [bsProjectId],
      );
      for (const row of existing.rows) {
        jiraKeyToBsId[row.jira_key] = row.id;
        jiraKeyWasDeleted[row.jira_key] = row.deleted_at !== null;
      }
    } catch {}

    const BATCH_SIZE = 50;
    for (let i = 0; i < jiraIssues.length; i += BATCH_SIZE) {
      const batch = jiraIssues.slice(i, i + BATCH_SIZE);

      for (const jiraIssue of batch) {
        try {
          const fields = jiraIssue.fields || {};

          const isSubtask =
            fields.issuetype?.name?.toLowerCase() === 'sub-task' ||
            fields.issuetype?.name?.toLowerCase() === 'subtask';
          const type = isSubtask ? 'subtask' : mapIssueType(fields.issuetype?.name);
          const priority = mapPriority(fields.priority?.name);
          const statusName = fields.status?.name || 'To Do';
          const statusId = statusNameToId[statusName.toLowerCase()] || defaultStatusId;

          const assigneeEmail = fields.assignee?.emailAddress?.toLowerCase();
          const reporterEmail = fields.reporter?.emailAddress?.toLowerCase();
          const assigneeId = assigneeEmail ? (emailToUserId[assigneeEmail] || null) : null;
          const reporterId = reporterEmail ? (emailToUserId[reporterEmail] || userId) : userId;

          // Track every matched user so we can add them to project_members later
          if (assigneeId) usedUserIds.add(assigneeId);
          if (reporterId) usedUserIds.add(reporterId);

          const storyPoints = typeof fields.customfield_10016 === 'number' ? fields.customfield_10016 : null;
          const timeEstimate = fields.timetracking?.originalEstimateSeconds != null
            ? fields.timetracking.originalEstimateSeconds
            : parseTimeToSeconds(fields.timetracking?.originalEstimate);
          const timeSpent = fields.timetracking?.timeSpentSeconds != null
            ? fields.timetracking.timeSpentSeconds
            : (parseTimeToSeconds(fields.timetracking?.timeSpent) || 0);

          const labels = Array.isArray(fields.labels) ? fields.labels : [];
          const description = extractDescriptionText(fields.description);
          const createdAt = fields.created ? new Date(fields.created) : new Date();
          const updatedAt = fields.updated ? new Date(fields.updated) : createdAt;

          // Get next issue number atomically (only needed for new rows — existing uses ON CONFLICT UPDATE)
          if (jiraKeyToBsId[jiraIssue.key]) {
            const existingIssueId = jiraKeyToBsId[jiraIssue.key];
            const wasDeleted = jiraKeyWasDeleted[jiraIssue.key];

            // Already imported — update in place.
            // deleted_at = NULL restores the issue when re-importing an archived project.
            await db.query(
              `UPDATE issues SET
                 status_id = $1, assignee_id = $2, title = $3, description = $4,
                 type = $5, priority = $6, story_points = $7, time_estimate = $8,
                 time_spent = $9, labels = $10, updated_at = $11,
                 deleted_at = NULL
               WHERE id = $12`,
              [statusId, assigneeId, fields.summary || jiraIssue.key, description,
               type, priority, storyPoints, timeEstimate, timeSpent, labels, updatedAt,
               existingIssueId],
            );

            // Re-import comments only when restoring a previously archived issue.
            // On a normal live-sync we skip comments to avoid duplicates.
            if (wasDeleted && Array.isArray(fields.comment?.comments)) {
              for (const comment of fields.comment.comments) {
                try {
                  const authorEmail = comment.author?.emailAddress?.toLowerCase();
                  const authorId = authorEmail ? (emailToUserId[authorEmail] || userId) : userId;
                  const commentBody = extractDescriptionText(comment.body) || (typeof comment.body === 'string' ? comment.body : '');
                  const commentCreatedAt = comment.created ? new Date(comment.created) : new Date();
                  await db.query(
                    `INSERT INTO comments (issue_id, author_id, content, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $4)
                     ON CONFLICT DO NOTHING`,
                    [existingIssueId, authorId, commentBody, commentCreatedAt],
                  );
                } catch {}
              }
            }

            processedIssues++;
          } else {
            // New issue
            const numResult = await db.query(
              `UPDATE projects SET next_issue_number = next_issue_number + 1, updated_at = NOW()
               WHERE id = $1 RETURNING next_issue_number - 1 AS issue_number`,
              [bsProjectId],
            );
            const issueNumber = numResult.rows[0].issue_number;
            const issueKey = `${bsProjectKey}-${issueNumber}`;

            const result = await db.query(
              `INSERT INTO issues (
                 organization_id, project_id, status_id, reporter_id, assignee_id,
                 "number", key, title, description, type, priority,
                 story_points, time_estimate, time_spent, labels, position,
                 jira_key, created_at, updated_at
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
               ON CONFLICT (project_id, jira_key) WHERE jira_key IS NOT NULL DO UPDATE SET
                 status_id = EXCLUDED.status_id,
                 assignee_id = EXCLUDED.assignee_id,
                 title = EXCLUDED.title,
                 description = EXCLUDED.description,
                 type = EXCLUDED.type,
                 priority = EXCLUDED.priority,
                 story_points = EXCLUDED.story_points,
                 time_estimate = EXCLUDED.time_estimate,
                 time_spent = EXCLUDED.time_spent,
                 labels = EXCLUDED.labels,
                 updated_at = EXCLUDED.updated_at,
                 deleted_at = NULL
               RETURNING id`,
              [
                organizationId, bsProjectId, statusId, reporterId, assigneeId,
                issueNumber, issueKey, fields.summary || jiraIssue.key, description,
                type, priority, storyPoints, timeEstimate, timeSpent, labels, issueNumber,
                jiraIssue.key, createdAt, updatedAt,
              ],
            );
            const issueId = result.rows[0].id;
            jiraKeyToBsId[jiraIssue.key] = issueId;
            processedIssues++;

            // Insert comments (skip on update path to avoid duplicates)
            if (Array.isArray(fields.comment?.comments)) {
              for (const comment of fields.comment.comments) {
                try {
                  const authorEmail = comment.author?.emailAddress?.toLowerCase();
                  const authorId = authorEmail ? (emailToUserId[authorEmail] || userId) : userId;
                  const commentBody = extractDescriptionText(comment.body) || (typeof comment.body === 'string' ? comment.body : '');
                  const commentCreatedAt = comment.created ? new Date(comment.created) : new Date();
                  await db.query(
                    `INSERT INTO comments (issue_id, author_id, content, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $4)
                     ON CONFLICT DO NOTHING`,
                    [issueId, authorId, commentBody, commentCreatedAt],
                  );
                } catch {}
              }
            }
          }
        } catch (issueErr: any) {
          const msg = `Failed to import ${jiraIssue.key}: ${issueErr.message}`;
          console.error(`[ImportWorker]   ${msg}`);
          allErrors.push(msg);
          failedIssues++;
          processedIssues++;
        }
      }

      // Progress update after each batch
      await updateApiJobStatus(jobId, {
        processed: processedIssues,
        failed: failedIssues,
        total: totalIssues,
        errors: allErrors.slice(-10),
      });
      await updateApiJobDb(db, jobId, organizationId, {
        processedIssues,
        failedIssues,
        totalIssues,
      });
      console.log(`[ImportWorker]   ${projectKey}: ${processedIssues}/${totalIssues} processed`);
    }

    // ── 4f. Link parent/subtask relationships ────────────────────────────────
    let linksCreated = 0;
    for (const jiraIssue of jiraIssues) {
      const parentKey = jiraIssue.fields?.parent?.key;
      if (parentKey && jiraKeyToBsId[jiraIssue.key] && jiraKeyToBsId[parentKey]) {
        try {
          await db.query(
            'UPDATE issues SET parent_id = $1 WHERE id = $2',
            [jiraKeyToBsId[parentKey], jiraKeyToBsId[jiraIssue.key]],
          );
          linksCreated++;
        } catch {}
      }
    }
    console.log(`[ImportWorker]   ${projectKey}: ${linksCreated} parent links created`);

    // ── 4g. Add all referenced users as project members ──────────────────────
    await ensureProjectMemberships(db, bsProjectId, usedUserIds);
  }

  // ── 5. Finalize ──────────────────────────────────────────────────────────────
  const finalStatus = (failedIssues > 0 && failedIssues === totalIssues) ? 'failed' : 'completed';
  await updateApiJobStatus(jobId, {
    status: finalStatus,
    total: totalIssues,
    processed: processedIssues,
    failed: failedIssues,
    errors: allErrors.slice(-50),
    completedAt: new Date().toISOString(),
  });
  await updateApiJobDb(db, jobId, organizationId, {
    status: finalStatus,
    totalIssues,
    processedIssues,
    failedIssues,
    completedAt: new Date(),
    errorLog: allErrors.slice(-100),
  });

  console.log(
    `[ImportWorker] jira-api-import job ${jobId} ${finalStatus}: ` +
    `${processedIssues}/${totalIssues} issues, ${failedIssues} failed`,
  );
}

// ─── Worker factory ─────────────────────────────────────────────────────────

export function createImportWorker(db: Pool): Worker {
  const worker = new Worker(
    'import',
    async (job: Job) => {
      console.log(`[ImportWorker] Processing job ${job.id} type="${job.name}"`);

      switch (job.name) {
        case 'jira-import':
          await processJiraImport(job, db);
          break;
        case 'jira-api-import':
          await processJiraApiImport(job, db);
          break;
        default:
          console.warn(`[ImportWorker] Unknown job name: ${job.name}`);
      }
    },
    {
      connection: createRedisConnection() as any,
      concurrency: 1, // Only one import at a time to avoid conflicts
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  );

  worker.on('completed', (job: Job) => {
    console.log(`[ImportWorker] Job ${job.id} (${job.name}) finished`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(
      `[ImportWorker] Job ${job?.id} (${job?.name}) failed:`,
      err.message,
    );

    // Update status in Redis if we have the jobId
    if (job?.data?.jobId) {
      updateStatus(job.data.jobId, {
        status: 'failed',
        errors: [err.message],
        completedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  });

  worker.on('error', (err: Error) => {
    console.error('[ImportWorker] Worker error:', err.message);
  });

  console.log('[ImportWorker] Started, listening on queue "import"');
  return worker;
}
