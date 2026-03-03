import { Worker } from 'bullmq';
import { connectDb, db } from './db';
import { connectElasticsearch, esClient } from './elasticsearch';
import { redisConnection } from './redis';
import { createEmailWorker } from './email/email.worker';
import { createNotificationWorker } from './notification/notification.worker';
import { createSearchWorker } from './search/search.worker';
import { createWebhookWorker } from './webhook/webhook.worker';
import { createAutomationWorker } from './automation/automation.worker';

async function main(): Promise<void> {
  console.log('[Main] ProjectFlow Worker starting up...');

  // ── 1. PostgreSQL ──────────────────────────────────────────────────────────
  try {
    await connectDb();
  } catch (err: any) {
    console.error('[Main] Failed to connect to PostgreSQL:', err.message);
    process.exit(1);
  }

  // ── 2. Elasticsearch (non-fatal — workers should still start) ─────────────
  await connectElasticsearch();

  // ── 3. Start workers ───────────────────────────────────────────────────────
  const workers: Worker[] = [];

  try {
    const emailWorker = createEmailWorker();
    workers.push(emailWorker);
  } catch (err: any) {
    console.error('[Main] Failed to start EmailWorker:', err.message);
    process.exit(1);
  }

  try {
    const notificationWorker = createNotificationWorker(db);
    workers.push(notificationWorker);
  } catch (err: any) {
    console.error('[Main] Failed to start NotificationWorker:', err.message);
    process.exit(1);
  }

  try {
    const searchWorker = await createSearchWorker(esClient, db);
    workers.push(searchWorker);
  } catch (err: any) {
    // Search worker failure is non-fatal — log and continue
    console.error('[Main] Failed to start SearchWorker (search indexing disabled):', err.message);
  }

  try {
    const webhookWorker = createWebhookWorker(db);
    workers.push(webhookWorker);
  } catch (err: any) {
    // Webhook worker failure is non-fatal — log and continue
    console.error('[Main] Failed to start WebhookWorker (webhook delivery disabled):', err.message);
  }

  try {
    const automationWorker = createAutomationWorker(db);
    workers.push(automationWorker);
  } catch (err: any) {
    // Automation worker failure is non-fatal — log and continue
    console.error('[Main] Failed to start AutomationWorker (automation disabled):', err.message);
  }

  console.log(`[Main] All workers running (${workers.length} active). Waiting for jobs...`);

  // ── 4. Graceful shutdown ───────────────────────────────────────────────────
  async function shutdown(signal: string): Promise<void> {
    console.log(`\n[Main] Received ${signal}. Starting graceful shutdown...`);

    // Close all workers — they will finish in-progress jobs before closing
    const closePromises = workers.map((worker) =>
      worker.close().catch((err: Error) => {
        console.error(`[Main] Error closing worker "${worker.name}":`, err.message);
      })
    );

    await Promise.all(closePromises);
    console.log('[Main] All workers closed');

    // Close the shared Redis connection
    try {
      await redisConnection.quit();
      console.log('[Main] Redis connection closed');
    } catch (err: any) {
      console.warn('[Main] Error closing Redis connection:', err.message);
    }

    // Close the PostgreSQL pool
    try {
      await db.end();
      console.log('[Main] PostgreSQL pool closed');
    } catch (err: any) {
      console.warn('[Main] Error closing PostgreSQL pool:', err.message);
    }

    console.log('[Main] Shutdown complete. Goodbye.');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  // Catch unhandled errors so the process doesn't die silently
  process.on('unhandledRejection', (reason: any) => {
    console.error('[Main] Unhandled promise rejection:', reason);
  });

  process.on('uncaughtException', (err: Error) => {
    console.error('[Main] Uncaught exception:', err.message, err.stack);
    shutdown('uncaughtException').catch(() => process.exit(1));
  });
}

main().catch((err: Error) => {
  console.error('[Main] Fatal startup error:', err.message, err.stack);
  process.exit(1);
});
