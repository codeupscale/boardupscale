import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import * as fs from 'fs';
import { createRedisConnection, redisConnection } from '../redis';

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
