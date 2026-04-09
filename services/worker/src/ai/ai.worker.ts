import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import { redisConnection } from '../redis';

type EmbeddingFn = (text: string) => Promise<number[] | null>;
let generateEmbedding: EmbeddingFn = async () => null;

/**
 * Initialize the embedding provider based on AI_PROVIDER env var.
 * Supports: openai, gemini. Anthropic does not offer embeddings.
 */
async function initEmbeddingProvider(): Promise<boolean> {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const provider = process.env.AI_PROVIDER || 'openai';

  if (!apiKey || process.env.AI_ENABLED !== 'true') {
    console.log('[AIWorker] AI is disabled or no API key — skipping init');
    return false;
  }

  try {
    switch (provider) {
      case 'gemini': {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = process.env.AI_EMBEDDING_MODEL || process.env.OPENAI_EMBEDDING_MODEL || 'gemini-embedding-exp-03-07';
        const embeddingModel = genAI.getGenerativeModel({ model });
        generateEmbedding = async (text: string) => {
          const result = await embeddingModel.embedContent(text.slice(0, 8000));
          return result.embedding.values;
        };
        console.log(`[AIWorker] Gemini embedding provider initialized (model: ${model})`);
        return true;
      }

      case 'anthropic': {
        console.log('[AIWorker] Anthropic does not support embeddings — embedding jobs will be skipped');
        generateEmbedding = async () => null;
        return true;
      }

      case 'openai':
      default: {
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({ apiKey });
        const model = process.env.AI_EMBEDDING_MODEL || process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
        generateEmbedding = async (text: string) => {
          const response = await client.embeddings.create({ model, input: text.slice(0, 8000) });
          return response.data[0].embedding;
        };
        console.log(`[AIWorker] OpenAI embedding provider initialized (model: ${model})`);
        return true;
      }
    }
  } catch (err: any) {
    console.error(`[AIWorker] Failed to initialize ${provider} provider:`, err.message);
    return false;
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

  const softDeleted = await db.query(
    `UPDATE chat_conversations SET deleted_at = NOW()
     WHERE deleted_at IS NULL AND (last_message_at < $1 OR (last_message_at IS NULL AND created_at < $1))
     RETURNING id`,
    [thirtyDaysAgo],
  );
  if (softDeleted.rowCount > 0) {
    console.log(`[AIWorker] Soft-deleted ${softDeleted.rowCount} stale conversations`);
  }

  const hardDeleted = await db.query(
    `DELETE FROM chat_conversations WHERE deleted_at < $1 RETURNING id`,
    [ninetyDaysAgo],
  );
  if (hardDeleted.rowCount > 0) {
    console.log(`[AIWorker] Hard-deleted ${hardDeleted.rowCount} expired conversations`);
  }
}

export async function createAiWorker(db: Pool): Promise<Worker> {
  const ready = await initEmbeddingProvider();
  if (!ready) {
    console.log('[AIWorker] Running in passthrough mode (no AI provider)');
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
      repeat: { pattern: '0 3 * * *' },
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
