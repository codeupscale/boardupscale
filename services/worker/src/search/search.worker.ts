import { Worker, Job } from 'bullmq';
import { Client } from '@elastic/elasticsearch';
import { Pool } from 'pg';
import { createRedisConnection } from '../redis';
import { ensureIndex, elasticsearchAvailable } from '../elasticsearch';

// ─── Constants ───────────────────────────────────────────────────────────────

export const ISSUES_INDEX = 'projectflow-issues';

export const ISSUES_MAPPING: Record<string, any> = {
  id:           { type: 'keyword' },
  organizationId: { type: 'keyword' },
  projectId:    { type: 'keyword' },
  projectName:  { type: 'text' },
  key:          { type: 'keyword' },
  title:        { type: 'text' },
  description:  { type: 'text' },
  type:         { type: 'keyword' },
  priority:     { type: 'keyword' },
  statusName:   { type: 'keyword' },
  assigneeName: { type: 'text' },
  labels:       { type: 'keyword' },
  createdAt:    { type: 'date' },
  updatedAt:    { type: 'date' },
};

// ─── Job payload types ───────────────────────────────────────────────────────

interface IssueDocument {
  id: string;
  organizationId: string;
  projectId: string;
  projectName: string;
  key: string;
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

interface IndexIssueJobData {
  issue: IssueDocument;
}

interface DeleteIssueJobData {
  issueId: string;
}

interface ReindexProjectJobData {
  projectId: string;
  organizationId: string;
}

// ─── Elasticsearch helpers ───────────────────────────────────────────────────

async function upsertIssue(esClient: Client, issue: IssueDocument): Promise<void> {
  await esClient.index({
    index: ISSUES_INDEX,
    id: issue.id,
    document: issue,
  });
}

async function deleteIssue(esClient: Client, issueId: string): Promise<void> {
  try {
    await esClient.delete({
      index: ISSUES_INDEX,
      id: issueId,
    });
  } catch (err: any) {
    // If the document doesn't exist, that's fine
    if (err.meta?.statusCode === 404) {
      console.warn(`[SearchWorker] Issue ${issueId} not found in index — skipping delete`);
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
      (item: any) => item.index?.error || item.update?.error
    );
    console.error(`[SearchWorker] Bulk index had ${errorItems.length} error(s):`, JSON.stringify(errorItems.slice(0, 5)));
  }

  const succeeded = response.items.filter(
    (item: any) => !item.index?.error && !item.update?.error
  ).length;

  return succeeded;
}

// ─── Fetch all project issues from PostgreSQL for reindex ────────────────────

async function fetchProjectIssues(
  pool: Pool,
  projectId: string,
  organizationId: string
): Promise<IssueDocument[]> {
  const result = await pool.query<IssueDocument>(
    `SELECT
       i.id,
       i.organization_id   AS "organizationId",
       i.project_id        AS "projectId",
       p.name              AS "projectName",
       i.key,
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
     JOIN statuses s ON s.id = i.status_id
     LEFT JOIN users u ON u.id = i.assignee_id
     WHERE i.project_id = $1
       AND i.organization_id = $2
       AND i.deleted_at IS NULL
     ORDER BY i.created_at ASC`,
    [projectId, organizationId]
  );

  return result.rows;
}

// ─── Worker ─────────────────────────────────────────────────────────────────

export async function createSearchWorker(esClient: Client, pool: Pool): Promise<Worker> {
  // Ensure the index exists before accepting jobs
  await ensureIndex(ISSUES_INDEX, ISSUES_MAPPING);

  const worker = new Worker(
    'search-index',
    async (job: Job) => {
      // If Elasticsearch became unavailable at runtime, skip gracefully
      if (!elasticsearchAvailable) {
        console.warn(`[SearchWorker] Elasticsearch unavailable — skipping job ${job.id} (${job.name})`);
        return;
      }

      console.log(`[SearchWorker] Processing job ${job.id} type="${job.name}"`);

      switch (job.name) {
        case 'index-issue': {
          const data = job.data as IndexIssueJobData;

          await upsertIssue(esClient, data.issue);

          console.log(`[SearchWorker] Upserted issue ${data.issue.id} (${data.issue.key}) in index "${ISSUES_INDEX}"`);
          break;
        }

        case 'delete-issue': {
          const data = job.data as DeleteIssueJobData;

          await deleteIssue(esClient, data.issueId);

          console.log(`[SearchWorker] Deleted issue ${data.issueId} from index "${ISSUES_INDEX}"`);
          break;
        }

        case 'reindex-project': {
          const data = job.data as ReindexProjectJobData;

          console.log(`[SearchWorker] Fetching all issues for project ${data.projectId}...`);
          const issues = await fetchProjectIssues(pool, data.projectId, data.organizationId);
          console.log(`[SearchWorker] Found ${issues.length} issue(s) to reindex`);

          if (issues.length === 0) {
            console.log(`[SearchWorker] No issues found for project ${data.projectId} — nothing to index`);
            break;
          }

          const BATCH_SIZE = 200;
          let totalIndexed = 0;

          for (let i = 0; i < issues.length; i += BATCH_SIZE) {
            const batch = issues.slice(i, i + BATCH_SIZE);
            const indexed = await bulkIndexIssues(esClient, batch);
            totalIndexed += indexed;
            console.log(
              `[SearchWorker] Reindex batch ${Math.floor(i / BATCH_SIZE) + 1}: ${indexed}/${batch.length} indexed (total so far: ${totalIndexed}/${issues.length})`
            );
          }

          console.log(`[SearchWorker] Reindex complete for project ${data.projectId}: ${totalIndexed}/${issues.length} issue(s) indexed`);
          break;
        }

        default:
          throw new Error(`[SearchWorker] Unknown job type: "${job.name}"`);
      }

      console.log(`[SearchWorker] Job ${job.id} (${job.name}) completed`);
    },
    {
      connection: createRedisConnection(),
      concurrency: 3,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    }
  );

  worker.on('completed', (job: Job) => {
    console.log(`[SearchWorker] Job ${job.id} (${job.name}) finished`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[SearchWorker] Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  worker.on('error', (err: Error) => {
    console.error('[SearchWorker] Worker error:', err.message);
  });

  console.log('[SearchWorker] Started, listening on queue "search-index"');
  return worker;
}
