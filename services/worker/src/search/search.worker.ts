import { Worker, Job } from 'bullmq';
import { Client } from '@elastic/elasticsearch';
import { Pool } from 'pg';
import { createRedisConnection } from '../redis';
import { ensureIndex, elasticsearchAvailable } from '../elasticsearch';

// ─── Constants ───────────────────────────────────────────────────────────────

export const ISSUES_INDEX = 'boardupscale-issues';
export const PROJECTS_INDEX = 'boardupscale-projects';
export const MEMBERS_INDEX = 'boardupscale-members';

export const ISSUES_MAPPING: Record<string, any> = {
  id: { type: 'keyword' },
  organizationId: { type: 'keyword' },
  projectId: { type: 'keyword' },
  projectName: { type: 'text' },
  key: { type: 'keyword' },
  number: { type: 'integer' },
  title: { type: 'text' },
  description: { type: 'text' },
  type: { type: 'keyword' },
  priority: { type: 'keyword' },
  statusName: { type: 'keyword' },
  assigneeName: { type: 'text' },
  labels: { type: 'keyword' },
  createdAt: { type: 'date' },
  updatedAt: { type: 'date' },
};

export const PROJECTS_MAPPING: Record<string, any> = {
  id: { type: 'keyword' },
  organizationId: { type: 'keyword' },
  key: { type: 'keyword' },
  legacyKeys: { type: 'keyword' },
  name: { type: 'text' },
  type: { type: 'keyword' },
  color: { type: 'keyword' },
  iconUrl: { type: 'keyword' },
  status: { type: 'keyword' },
  updatedAt: { type: 'date' },
};

export const MEMBERS_MAPPING: Record<string, any> = {
  id: { type: 'keyword' },
  userId: { type: 'keyword' },
  organizationId: { type: 'keyword' },
  displayName: { type: 'text', fields: { keyword: { type: 'keyword' } } },
  email: { type: 'text', fields: { keyword: { type: 'keyword' } } },
  avatarUrl: { type: 'keyword' },
  projectIds: { type: 'keyword' },
  sampleProjectKey: { type: 'keyword' },
  updatedAt: { type: 'date' },
};

// ─── Job payload types ───────────────────────────────────────────────────────

interface IssueDocument {
  id: string;
  organizationId: string;
  projectId: string;
  projectName: string;
  key: string;
  number: number;
  title: string;
  description: string;
  type: string;
  priority: string;
  statusName: string;
  assigneeName: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

interface ProjectDocument {
  id: string;
  organizationId: string;
  key: string;
  legacyKeys: string[];
  name: string;
  type: string;
  color?: string;
  iconUrl?: string;
  status: string;
  updatedAt: string;
}

interface MemberDocument {
  id: string;
  userId: string;
  organizationId: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  projectIds: string[];
  sampleProjectKey?: string;
  updatedAt: string;
}

interface IndexIssueJobData {
  issue: IssueDocument;
}

interface DeleteIssueJobData {
  issueId: string;
}

interface IndexProjectJobData {
  project: ProjectDocument;
}

interface DeleteProjectJobData {
  projectId: string;
}

interface RefreshMemberJobData {
  organizationId: string;
  userId: string;
}

interface DeleteMemberJobData {
  documentId: string;
}

interface ReindexProjectJobData {
  jobId?: string;
  projectId: string;
  organizationId: string;
}

const REINDEX_PHASE_PROJECT = 1;
const REINDEX_PHASE_ISSUES = 2;
const REINDEX_PHASE_MEMBERS = 3;
const REINDEX_ISSUE_BATCH_SIZE = 200;

class SearchReindexCancelledError extends Error {
  constructor(jobId: string) {
    super(`Search reindex job ${jobId} was cancelled`);
    this.name = 'SearchReindexCancelledError';
  }
}

interface ReindexJobRow {
  id: string;
  status: string;
  current_phase: number;
  current_offset: number;
  completed_phases: number[];
  total_issues: number;
  processed_issues: number;
  total_members: number;
  processed_members: number;
  error_log: string[] | null;
}

// ─── Elasticsearch helpers ───────────────────────────────────────────────────

function memberDocumentId(organizationId: string, userId: string): string {
  return `${organizationId}_${userId}`;
}

async function upsertDocument(
  esClient: Client,
  index: string,
  id: string,
  document: object,
): Promise<void> {
  await esClient.index({ index, id, document });
}

async function deleteDocument(esClient: Client, index: string, id: string): Promise<void> {
  try {
    await esClient.delete({ index, id });
  } catch (err: any) {
    if (err.meta?.statusCode === 404) {
      console.warn(`[SearchWorker] Document ${id} not found in "${index}" — skipping delete`);
      return;
    }
    throw err;
  }
}

async function bulkIndexIssues(esClient: Client, issues: IssueDocument[]): Promise<number> {
  if (issues.length === 0) return 0;

  const operations = issues.flatMap((issue) => [
    { index: { _index: ISSUES_INDEX, _id: issue.id } },
    issue,
  ]);

  const response = await esClient.bulk({ operations, refresh: true });

  if (response.errors) {
    const errorItems = response.items.filter(
      (item: any) => item.index?.error || item.update?.error,
    );
    console.error(
      `[SearchWorker] Bulk index had ${errorItems.length} error(s):`,
      JSON.stringify(errorItems.slice(0, 5)),
    );
  }

  return response.items.filter((item: any) => !item.index?.error && !item.update?.error).length;
}

// ─── PostgreSQL fetch helpers ────────────────────────────────────────────────

async function fetchProjectIssues(
  pool: Pool,
  projectId: string,
  organizationId: string,
): Promise<IssueDocument[]> {
  const result = await pool.query<IssueDocument>(
    `SELECT
       i.id,
       i.organization_id   AS "organizationId",
       i.project_id        AS "projectId",
       p.name              AS "projectName",
       i.key,
       i.number,
       i.title,
       COALESCE(i.description, '') AS description,
       i.type,
       i.priority,
       s.name              AS "statusName",
       COALESCE(u.display_name, '') AS "assigneeName",
       COALESCE(i.labels, ARRAY[]::text[]) AS labels,
       i.created_at        AS "createdAt",
       i.updated_at        AS "updatedAt"
     FROM issues i
     JOIN projects p ON p.id = i.project_id
    LEFT JOIN issue_statuses s ON s.id = i.status_id
     LEFT JOIN users u ON u.id = i.assignee_id
     WHERE i.project_id = $1
       AND i.organization_id = $2
       AND i.deleted_at IS NULL
     ORDER BY i.created_at ASC`,
    [projectId, organizationId],
  );

  return result.rows;
}

async function fetchProjectDocument(
  pool: Pool,
  projectId: string,
  organizationId: string,
): Promise<ProjectDocument | null> {
  const result = await pool.query<ProjectDocument>(
    `SELECT
       p.id,
       p.organization_id AS "organizationId",
       p.key,
       COALESCE(
         (SELECT array_agg(a.old_key ORDER BY a.created_at)
            FROM project_key_aliases a
           WHERE a.project_id = p.id
             AND a.organization_id = p.organization_id),
         ARRAY[]::varchar[]
       ) AS "legacyKeys",
       p.name,
       p.type,
       p.color,
       p.icon_url        AS "iconUrl",
       p.status,
       p.updated_at      AS "updatedAt"
     FROM projects p
     WHERE p.id = $1
       AND p.organization_id = $2
       AND p.status != 'archived'`,
    [projectId, organizationId],
  );

  return result.rows[0] ?? null;
}

async function fetchMemberDocument(
  pool: Pool,
  organizationId: string,
  userId: string,
): Promise<MemberDocument | null> {
  const result = await pool.query<{
    userId: string;
    organizationId: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
    projectIds: string[] | null;
    sampleProjectKey: string | null;
    updatedAt: string;
  }>(
    `SELECT
       u.id AS "userId",
       $2::uuid AS "organizationId",
       u.display_name AS "displayName",
       u.email,
       u.avatar_url AS "avatarUrl",
       COALESCE(
         array_agg(DISTINCT pm.project_id) FILTER (
           WHERE p.id IS NOT NULL AND p.status != 'archived'
         ),
         ARRAY[]::uuid[]
       ) AS "projectIds",
       MIN(p.key) AS "sampleProjectKey",
       u.updated_at AS "updatedAt"
     FROM users u
     LEFT JOIN organization_members om
       ON om.user_id = u.id AND om.organization_id = $2
     LEFT JOIN project_members pm ON pm.user_id = u.id
     LEFT JOIN projects p
       ON p.id = pm.project_id
      AND p.organization_id = $2
     WHERE u.id = $1
       AND u.is_active = TRUE
       AND (
         om.user_id IS NOT NULL
         OR EXISTS (
           SELECT 1
             FROM project_members pm2
             JOIN projects p2 ON p2.id = pm2.project_id
            WHERE pm2.user_id = u.id
              AND p2.organization_id = $2
              AND p2.status != 'archived'
         )
       )
     GROUP BY u.id`,
    [userId, organizationId],
  );

  const row = result.rows[0];
  if (!row) return null;

  const projectIds = row.projectIds ?? [];
  if (projectIds.length === 0 && !row.sampleProjectKey) {
    // Org member with no project ties — still index for org-wide directory search.
    const orgOnly = await pool.query(
      `SELECT 1 FROM organization_members WHERE user_id = $1 AND organization_id = $2`,
      [userId, organizationId],
    );
    if (orgOnly.rowCount === 0) return null;
  }

  return {
    id: memberDocumentId(organizationId, userId),
    userId: row.userId,
    organizationId: row.organizationId,
    displayName: row.displayName,
    email: row.email,
    avatarUrl: row.avatarUrl ?? undefined,
    projectIds,
    sampleProjectKey: row.sampleProjectKey ?? undefined,
    updatedAt: row.updatedAt,
  };
}

async function fetchProjectIssueCount(
  pool: Pool,
  projectId: string,
  organizationId: string,
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM issues
      WHERE project_id = $1
        AND organization_id = $2
        AND deleted_at IS NULL`,
    [projectId, organizationId],
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

async function fetchProjectIssuesBatch(
  pool: Pool,
  projectId: string,
  organizationId: string,
  offset: number,
  limit: number,
): Promise<IssueDocument[]> {
  const result = await pool.query<IssueDocument>(
    `SELECT
       i.id,
       i.organization_id   AS "organizationId",
       i.project_id        AS "projectId",
       p.name              AS "projectName",
       i.key,
       i.number,
       i.title,
       COALESCE(i.description, '') AS description,
       i.type,
       i.priority,
       s.name              AS "statusName",
       COALESCE(u.display_name, '') AS "assigneeName",
       COALESCE(i.labels, ARRAY[]::text[]) AS labels,
       i.created_at        AS "createdAt",
       i.updated_at        AS "updatedAt"
     FROM issues i
     JOIN projects p ON p.id = i.project_id
    LEFT JOIN issue_statuses s ON s.id = i.status_id
     LEFT JOIN users u ON u.id = i.assignee_id
     WHERE i.project_id = $1
       AND i.organization_id = $2
       AND i.deleted_at IS NULL
     ORDER BY i.created_at ASC
     OFFSET $3 LIMIT $4`,
    [projectId, organizationId, offset, limit],
  );
  return result.rows;
}

async function loadReindexJob(pool: Pool, jobId: string): Promise<ReindexJobRow | null> {
  const result = await pool.query<ReindexJobRow>(
    `SELECT id, status, current_phase, current_offset, completed_phases,
            total_issues, processed_issues, total_members, processed_members, error_log
       FROM search_reindex_jobs
      WHERE id = $1`,
    [jobId],
  );
  return result.rows[0] ?? null;
}

async function checkReindexCancelled(pool: Pool, jobId: string): Promise<void> {
  const result = await pool.query<{ status: string }>(
    `SELECT status FROM search_reindex_jobs WHERE id = $1`,
    [jobId],
  );
  if (result.rows[0]?.status === 'cancelled') {
    throw new SearchReindexCancelledError(jobId);
  }
}

async function markReindexProcessing(pool: Pool, jobId: string): Promise<void> {
  await pool.query(
    `UPDATE search_reindex_jobs
        SET status = 'processing',
            started_at = COALESCE(started_at, NOW()),
            updated_at = NOW()
      WHERE id = $1`,
    [jobId],
  );
}

async function updateReindexProgress(
  pool: Pool,
  jobId: string,
  patch: Partial<{
    currentPhase: number;
    currentOffset: number;
    completedPhases: number[];
    totalIssues: number;
    processedIssues: number;
    totalMembers: number;
    processedMembers: number;
  }>,
): Promise<void> {
  const sets: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [jobId];
  let idx = 2;

  if (patch.currentPhase !== undefined) {
    sets.push(`current_phase = $${idx++}`);
    values.push(patch.currentPhase);
  }
  if (patch.currentOffset !== undefined) {
    sets.push(`current_offset = $${idx++}`);
    values.push(patch.currentOffset);
  }
  if (patch.completedPhases !== undefined) {
    sets.push(`completed_phases = $${idx++}::jsonb`);
    values.push(JSON.stringify(patch.completedPhases));
  }
  if (patch.totalIssues !== undefined) {
    sets.push(`total_issues = $${idx++}`);
    values.push(patch.totalIssues);
  }
  if (patch.processedIssues !== undefined) {
    sets.push(`processed_issues = $${idx++}`);
    values.push(patch.processedIssues);
  }
  if (patch.totalMembers !== undefined) {
    sets.push(`total_members = $${idx++}`);
    values.push(patch.totalMembers);
  }
  if (patch.processedMembers !== undefined) {
    sets.push(`processed_members = $${idx++}`);
    values.push(patch.processedMembers);
  }

  await pool.query(
    `UPDATE search_reindex_jobs SET ${sets.join(', ')} WHERE id = $1`,
    values,
  );
}

async function markReindexCompleted(pool: Pool, jobId: string): Promise<void> {
  await pool.query(
    `UPDATE search_reindex_jobs
        SET status = 'completed',
            completed_at = NOW(),
            updated_at = NOW()
      WHERE id = $1`,
    [jobId],
  );
}

async function appendReindexError(pool: Pool, jobId: string, message: string): Promise<void> {
  await pool.query(
    `UPDATE search_reindex_jobs
        SET error_log = COALESCE(error_log, '[]'::jsonb) || $2::jsonb,
            updated_at = NOW()
      WHERE id = $1`,
    [jobId, JSON.stringify([message])],
  );
}

async function markReindexFailed(pool: Pool, jobId: string, message: string): Promise<void> {
  await pool.query(
    `UPDATE search_reindex_jobs
        SET status = 'failed',
            error_log = COALESCE(error_log, '[]'::jsonb) || $2::jsonb,
            completed_at = NOW(),
            updated_at = NOW()
      WHERE id = $1 AND status != 'cancelled'`,
    [jobId, JSON.stringify([message])],
  );
}

async function processReindexProject(
  esClient: Client,
  pool: Pool,
  data: ReindexProjectJobData,
): Promise<void> {
  if (!data.jobId) {
    await runLegacyReindexProject(esClient, pool, data);
    return;
  }

  const jobId = data.jobId;
  const job = await loadReindexJob(pool, jobId);
  if (!job) {
    throw new Error(`Search reindex job ${jobId} not found`);
  }
  if (job.status === 'cancelled') {
    console.log(`[SearchWorker] Reindex ${jobId} already cancelled — skipping`);
    return;
  }
  if (job.status === 'completed') {
    console.log(`[SearchWorker] Reindex ${jobId} already completed — skipping`);
    return;
  }

  await markReindexProcessing(pool, jobId);
  const completedPhases = Array.isArray(job.completed_phases) ? [...job.completed_phases] : [];

  try {
    // Phase 1 — project document
    if (!completedPhases.includes(REINDEX_PHASE_PROJECT)) {
      await checkReindexCancelled(pool, jobId);
      await updateReindexProgress(pool, jobId, { currentPhase: REINDEX_PHASE_PROJECT });

      const project = await fetchProjectDocument(pool, data.projectId, data.organizationId);
      if (project) {
        await upsertDocument(esClient, PROJECTS_INDEX, project.id, project);
      } else {
        await deleteDocument(esClient, PROJECTS_INDEX, data.projectId);
      }

      completedPhases.push(REINDEX_PHASE_PROJECT);
      await updateReindexProgress(pool, jobId, {
        completedPhases,
        currentPhase: REINDEX_PHASE_ISSUES,
      });
    }

    // Phase 2 — issues (batched, resumable)
    if (!completedPhases.includes(REINDEX_PHASE_ISSUES)) {
      const totalIssues = await fetchProjectIssueCount(pool, data.projectId, data.organizationId);
      let offset = job.current_offset ?? 0;
      let processedIssues = job.processed_issues ?? 0;

      await updateReindexProgress(pool, jobId, {
        currentPhase: REINDEX_PHASE_ISSUES,
        totalIssues,
        processedIssues,
        currentOffset: offset,
      });

      while (offset < totalIssues) {
        await checkReindexCancelled(pool, jobId);
        const batch = await fetchProjectIssuesBatch(
          pool,
          data.projectId,
          data.organizationId,
          offset,
          REINDEX_ISSUE_BATCH_SIZE,
        );
        if (batch.length === 0) break;

        processedIssues += await bulkIndexIssues(esClient, batch);
        offset += batch.length;

        await updateReindexProgress(pool, jobId, {
          processedIssues,
          currentOffset: offset,
        });
      }

      completedPhases.push(REINDEX_PHASE_ISSUES);
      await updateReindexProgress(pool, jobId, {
        completedPhases,
        currentPhase: REINDEX_PHASE_MEMBERS,
        currentOffset: 0,
      });
    }

    // Phase 3 — members
    if (!completedPhases.includes(REINDEX_PHASE_MEMBERS)) {
      await checkReindexCancelled(pool, jobId);
      const memberUserIds = await fetchProjectMemberUserIds(pool, data.projectId);
      let processedMembers = 0;

      await updateReindexProgress(pool, jobId, {
        currentPhase: REINDEX_PHASE_MEMBERS,
        totalMembers: memberUserIds.length,
        processedMembers: 0,
      });

      for (const userId of memberUserIds) {
        await checkReindexCancelled(pool, jobId);
        const member = await fetchMemberDocument(pool, data.organizationId, userId);
        if (member) {
          await upsertDocument(esClient, MEMBERS_INDEX, member.id, member);
        }
        processedMembers += 1;
        await updateReindexProgress(pool, jobId, { processedMembers });
      }

      completedPhases.push(REINDEX_PHASE_MEMBERS);
      await updateReindexProgress(pool, jobId, { completedPhases });
    }

    await markReindexCompleted(pool, jobId);
    console.log(`[SearchWorker] Reindex job ${jobId} completed for project ${data.projectId}`);
  } catch (err: unknown) {
    if (err instanceof SearchReindexCancelledError) {
      console.log(`[SearchWorker] Reindex job ${jobId} stopped after cancellation`);
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    await appendReindexError(pool, jobId, message);
    throw err;
  }
}

async function runLegacyReindexProject(
  esClient: Client,
  pool: Pool,
  data: ReindexProjectJobData,
): Promise<void> {
  const project = await fetchProjectDocument(pool, data.projectId, data.organizationId);
  if (project) {
    await upsertDocument(esClient, PROJECTS_INDEX, project.id, project);
  } else {
    await deleteDocument(esClient, PROJECTS_INDEX, data.projectId);
  }

  const issues = await fetchProjectIssues(pool, data.projectId, data.organizationId);
  if (issues.length > 0) {
    const BATCH_SIZE = REINDEX_ISSUE_BATCH_SIZE;
    for (let i = 0; i < issues.length; i += BATCH_SIZE) {
      await bulkIndexIssues(esClient, issues.slice(i, i + BATCH_SIZE));
    }
  }

  const memberUserIds = await fetchProjectMemberUserIds(pool, data.projectId);
  for (const userId of memberUserIds) {
    const member = await fetchMemberDocument(pool, data.organizationId, userId);
    if (member) {
      await upsertDocument(esClient, MEMBERS_INDEX, member.id, member);
    }
  }
}

async function fetchProjectMemberUserIds(
  pool: Pool,
  projectId: string,
): Promise<string[]> {
  const result = await pool.query<{ userId: string }>(
    `SELECT user_id AS "userId" FROM project_members WHERE project_id = $1`,
    [projectId],
  );
  return result.rows.map((row) => row.userId);
}

// ─── Worker ─────────────────────────────────────────────────────────────────

export async function createSearchWorker(esClient: Client, pool: Pool): Promise<Worker> {
  await ensureIndex(ISSUES_INDEX, ISSUES_MAPPING);
  await ensureIndex(PROJECTS_INDEX, PROJECTS_MAPPING);
  await ensureIndex(MEMBERS_INDEX, MEMBERS_MAPPING);

  const worker = new Worker(
    'search-index',
    async (job: Job) => {
      if (!elasticsearchAvailable) {
        // For durable reindex jobs, "skipping" creates a misleading completed queue state while
        // the DB job record remains pending. Mark the job failed in DB so the UI can recover.
        if (job.name === 'reindex-project') {
          const data = job.data as ReindexProjectJobData;
          if (data?.jobId) {
            try {
              await markReindexFailed(
                pool,
                data.jobId,
                'Elasticsearch is unavailable. Start Elasticsearch and retry the reindex.',
              );
            } catch (dbErr: unknown) {
              const message = dbErr instanceof Error ? dbErr.message : String(dbErr);
              console.error(
                `[SearchWorker] Failed to mark reindex job ${data.jobId} as failed while Elasticsearch is down:`,
                message,
              );
            }
          }
        }

        console.warn(`[SearchWorker] Elasticsearch unavailable — skipping job ${job.id} (${job.name})`);
        return;
      }

      console.log(`[SearchWorker] Processing job ${job.id} type="${job.name}"`);

      switch (job.name) {
        case 'index-issue': {
          const data = job.data as IndexIssueJobData;
          await upsertDocument(esClient, ISSUES_INDEX, data.issue.id, data.issue);
          console.log(`[SearchWorker] Upserted issue ${data.issue.id} (${data.issue.key})`);
          break;
        }

        case 'delete-issue': {
          const data = job.data as DeleteIssueJobData;
          await deleteDocument(esClient, ISSUES_INDEX, data.issueId);
          console.log(`[SearchWorker] Deleted issue ${data.issueId}`);
          break;
        }

        case 'index-project': {
          const data = job.data as IndexProjectJobData;
          await upsertDocument(esClient, PROJECTS_INDEX, data.project.id, data.project);
          console.log(`[SearchWorker] Upserted project ${data.project.id} (${data.project.key})`);
          break;
        }

        case 'delete-project': {
          const data = job.data as DeleteProjectJobData;
          await deleteDocument(esClient, PROJECTS_INDEX, data.projectId);
          console.log(`[SearchWorker] Deleted project ${data.projectId}`);
          break;
        }

        case 'refresh-member': {
          const data = job.data as RefreshMemberJobData;
          const member = await fetchMemberDocument(pool, data.organizationId, data.userId);
          if (!member) {
            await deleteDocument(
              esClient,
              MEMBERS_INDEX,
              memberDocumentId(data.organizationId, data.userId),
            );
            console.log(`[SearchWorker] Removed member ${data.userId} from org ${data.organizationId} index`);
            break;
          }
          await upsertDocument(esClient, MEMBERS_INDEX, member.id, member);
          console.log(`[SearchWorker] Refreshed member ${data.userId} for org ${data.organizationId}`);
          break;
        }

        case 'delete-member': {
          const data = job.data as DeleteMemberJobData;
          await deleteDocument(esClient, MEMBERS_INDEX, data.documentId);
          console.log(`[SearchWorker] Deleted member document ${data.documentId}`);
          break;
        }

        case 'reindex-project': {
          const data = job.data as ReindexProjectJobData;
          await processReindexProject(esClient, pool, data);
          break;
        }

        default:
          throw new Error(`[SearchWorker] Unknown job type: "${job.name}"`);
      }

      console.log(`[SearchWorker] Job ${job.id} (${job.name}) completed`);
    },
    {
      connection: createRedisConnection() as any,
      concurrency: 3,
      lockDuration: 300000,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  );

  worker.on('completed', (job: Job) => {
    console.log(`[SearchWorker] Job ${job.id} (${job.name}) finished`);
  });

  worker.on('failed', async (job: Job | undefined, err: Error) => {
    console.error(`[SearchWorker] Job ${job?.id} (${job?.name}) failed:`, err.message);
    if (job?.name !== 'reindex-project') return;

    const data = job.data as ReindexProjectJobData;
    if (!data?.jobId) return;

    const maxAttempts = job.opts.attempts ?? 1;
    if ((job.attemptsMade ?? 0) < maxAttempts) {
      return;
    }

    try {
      await markReindexFailed(pool, data.jobId, err.message);
    } catch (dbErr: unknown) {
      const message = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error(`[SearchWorker] Failed to mark reindex job ${data.jobId} as failed:`, message);
    }
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[SearchWorker] Job ${jobId} stalled — lock may have expired`);
  });

  worker.on('error', (err: Error) => {
    console.error('[SearchWorker] Worker error:', err.message);
  });

  console.log('[SearchWorker] Started, listening on queue "search-index"');
  return worker;
}
