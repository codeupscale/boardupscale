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

  // Fetch issue title + description
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

  // Store embedding as a PostgreSQL vector
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

  console.log('[AIWorker] AI worker started');
  return worker;
}
