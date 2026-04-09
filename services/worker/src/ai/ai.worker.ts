import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import { redisConnection } from '../redis';

let openai: any = null;
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

async function initOpenAI(): Promise<boolean> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || process.env.AI_ENABLED !== 'true') {
    console.log('[AIWorker] AI is disabled or no API key — skipping OpenAI init');
    return false;
  }

  try {
    const { default: OpenAI } = await import('openai');
    openai = new OpenAI({ apiKey });
    console.log('[AIWorker] OpenAI client initialized');
    return true;
  } catch (err: any) {
    console.error('[AIWorker] Failed to initialize OpenAI:', err.message);
    return false;
  }
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!openai) return null;
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000),
    });
    return response.data[0].embedding;
  } catch (err: any) {
    console.error('[AIWorker] Embedding generation failed:', err.message);
    return null;
  }
}

async function processGenerateEmbedding(job: Job, db: Pool): Promise<void> {
  const { issueId, organizationId } = job.data;

  const result = await db.query(
    'SELECT title, description FROM issues WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
    [issueId, organizationId],
  );

  if (result.rows.length === 0) {
    console.log(`[AIWorker] Issue ${issueId} not found — skipping embedding`);
    return;
  }

  const { title, description } = result.rows[0];
  const text = description ? `${title}\n\n${description}` : title;

  const embedding = await generateEmbedding(text);
  if (!embedding) {
    console.log(`[AIWorker] No embedding generated for issue ${issueId}`);
    return;
  }

  const vectorStr = `[${embedding.join(',')}]`;
  await db.query(
    'UPDATE issues SET embedding = $1::vector WHERE id = $2',
    [vectorStr, issueId],
  );

  console.log(`[AIWorker] Embedding stored for issue ${issueId} (${embedding.length} dims)`);
}

async function processBatchEmbedProject(job: Job, db: Pool): Promise<void> {
  const { projectId, organizationId } = job.data;

  const result = await db.query(
    `SELECT id, title, description FROM issues
     WHERE project_id = $1 AND organization_id = $2 AND deleted_at IS NULL AND embedding IS NULL
     ORDER BY created_at DESC
     LIMIT 500`,
    [projectId, organizationId],
  );

  console.log(`[AIWorker] Batch embedding ${result.rows.length} issues for project ${projectId}`);

  let processed = 0;
  for (const row of result.rows) {
    const text = row.description ? `${row.title}\n\n${row.description}` : row.title;
    const embedding = await generateEmbedding(text);
    if (embedding) {
      const vectorStr = `[${embedding.join(',')}]`;
      await db.query('UPDATE issues SET embedding = $1::vector WHERE id = $2', [vectorStr, row.id]);
      processed++;
    }
    // Rate limit: ~50 per minute
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log(`[AIWorker] Batch embedding complete: ${processed}/${result.rows.length} issues for project ${projectId}`);
}

async function processCleanupConversations(job: Job, db: Pool): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // Soft-delete conversations with no messages in 30 days
  const softDeleted = await db.query(
    `UPDATE chat_conversations SET deleted_at = NOW()
     WHERE deleted_at IS NULL AND (last_message_at < $1 OR (last_message_at IS NULL AND created_at < $1))
     RETURNING id`,
    [thirtyDaysAgo],
  );
  if (softDeleted.rowCount > 0) {
    console.log(`[AIWorker] Soft-deleted ${softDeleted.rowCount} stale conversations`);
  }

  // Hard-delete conversations soft-deleted 90+ days ago
  const hardDeleted = await db.query(
    `DELETE FROM chat_conversations WHERE deleted_at < $1 RETURNING id`,
    [ninetyDaysAgo],
  );
  if (hardDeleted.rowCount > 0) {
    console.log(`[AIWorker] Hard-deleted ${hardDeleted.rowCount} expired conversations`);
  }
}

export async function createAiWorker(db: Pool): Promise<Worker> {
  const ready = await initOpenAI();
  if (!ready) {
    console.log('[AIWorker] Running in passthrough mode (no OpenAI)');
  }

  const worker = new Worker(
    'ai',
    async (job: Job) => {
      switch (job.name) {
        case 'generate-embedding':
          await processGenerateEmbedding(job, db);
          break;
        case 'batch-embed-project':
          await processBatchEmbedProject(job, db);
          break;
        case 'cleanup-conversations':
          await processCleanupConversations(job, db);
          break;
        default:
          console.warn(`[AIWorker] Unknown job name: ${job.name}`);
      }
    },
    {
      connection: redisConnection as any,
      concurrency: 2,
    },
  );

  worker.on('completed', (job: Job) => {
    console.log(`[AIWorker] Job ${job.name} (${job.id}) completed`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[AIWorker] Job ${job?.name} (${job?.id}) failed:`, err.message);
  });

  // Schedule daily cleanup at startup (repeatable job)
  try {
    const { Queue } = await import('bullmq');
    const aiQueue = new Queue('ai', { connection: redisConnection as any });
    await aiQueue.add('cleanup-conversations', {}, {
      repeat: { pattern: '0 3 * * *' }, // 3 AM daily
      removeOnComplete: true,
      removeOnFail: 5,
    });
    await aiQueue.close();
  } catch (err: any) {
    console.warn(`[AIWorker] Failed to schedule cleanup job: ${err.message}`);
  }

  console.log('[AIWorker] AI worker started');
  return worker;
}
