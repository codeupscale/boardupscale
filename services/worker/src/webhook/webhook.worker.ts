import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import * as crypto from 'crypto';
import { createRedisConnection } from '../redis';

// ─── Job payload types ───────────────────────────────────────────────────────

interface WebhookDeliverJobData {
  deliveryId: string;
  webhookId: string;
  url: string;
  secret: string | null;
  headers: Record<string, string>;
  eventType: string;
  payload: Record<string, any>;
}

// ─── Retry configuration ────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [
  60 * 1000,       // 1 minute
  5 * 60 * 1000,   // 5 minutes
  30 * 60 * 1000,  // 30 minutes
];

// ─── HMAC signature helper ──────────────────────────────────────────────────

function computeSignature(secret: string, body: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('hex');
}

// ─── Worker ─────────────────────────────────────────────────────────────────

export function createWebhookWorker(pool: Pool): Worker {
  const worker = new Worker(
    'webhooks',
    async (job: Job) => {
      const data = job.data as WebhookDeliverJobData;
      console.log(
        `[WebhookWorker] Processing delivery ${data.deliveryId} for webhook ${data.webhookId} (event=${data.eventType})`,
      );

      const bodyString = JSON.stringify(data.payload);
      const startTime = Date.now();

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'ProjectFlow-Webhook/1.0',
        'X-ProjectFlow-Event': data.eventType,
        'X-ProjectFlow-Delivery-Id': data.deliveryId,
        ...data.headers,
      };

      // Add HMAC signature if a secret is configured
      if (data.secret) {
        headers['X-ProjectFlow-Signature'] = computeSignature(
          data.secret,
          bodyString,
        );
      }

      let responseStatus: number | null = null;
      let responseBody: string | null = null;
      let responseHeaders: Record<string, any> | null = null;
      let durationMs = 0;
      let status: 'success' | 'failed' = 'failed';

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(data.url, {
          method: 'POST',
          headers,
          body: bodyString,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        durationMs = Date.now() - startTime;
        responseStatus = response.status;
        responseBody = await response.text().catch(() => '');
        responseHeaders = Object.fromEntries(response.headers.entries());

        // Consider 2xx as success
        if (response.ok) {
          status = 'success';
        }
      } catch (err: any) {
        durationMs = Date.now() - startTime;
        responseBody = err.message || 'Request failed';
      }

      // Get current attempt count from delivery record
      const deliveryResult = await pool.query(
        'SELECT attempt FROM webhook_deliveries WHERE id = $1',
        [data.deliveryId],
      );
      const currentAttempt = deliveryResult.rows[0]?.attempt || 1;

      // Calculate next retry if failed
      let nextRetryAt: Date | null = null;
      if (status === 'failed' && currentAttempt < MAX_ATTEMPTS) {
        const delayMs = RETRY_DELAYS_MS[currentAttempt - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        nextRetryAt = new Date(Date.now() + delayMs);
      }

      // Update delivery record
      await pool.query(
        `UPDATE webhook_deliveries
         SET response_status = $1,
             response_body = $2,
             response_headers = $3,
             duration_ms = $4,
             status = $5,
             next_retry_at = $6
         WHERE id = $7`,
        [
          responseStatus,
          responseBody ? responseBody.substring(0, 65535) : null,
          responseHeaders ? JSON.stringify(responseHeaders) : null,
          durationMs,
          status,
          nextRetryAt,
          data.deliveryId,
        ],
      );

      console.log(
        `[WebhookWorker] Delivery ${data.deliveryId}: status=${status}, httpStatus=${responseStatus}, duration=${durationMs}ms`,
      );

      // Schedule retry if needed
      if (status === 'failed' && currentAttempt < MAX_ATTEMPTS && nextRetryAt) {
        const delayMs = RETRY_DELAYS_MS[currentAttempt - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];

        // Create a new delivery record for the retry attempt
        const retryResult = await pool.query(
          `INSERT INTO webhook_deliveries (webhook_id, event_type, payload, status, attempt, created_at)
           VALUES ($1, $2, $3, 'pending', $4, NOW())
           RETURNING id`,
          [data.webhookId, data.eventType, JSON.stringify(data.payload), currentAttempt + 1],
        );

        const retryDeliveryId = retryResult.rows[0].id;

        // Queue the retry with a delay
        await job.queue.add(
          'deliver',
          {
            ...data,
            deliveryId: retryDeliveryId,
          },
          {
            delay: delayMs,
            attempts: 1,
            removeOnComplete: { count: 500 },
            removeOnFail: { count: 1000 },
          },
        );

        console.log(
          `[WebhookWorker] Scheduled retry ${currentAttempt + 1}/${MAX_ATTEMPTS} for webhook ${data.webhookId} in ${Math.round(delayMs / 1000)}s`,
        );
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 10,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    },
  );

  worker.on('completed', (job: Job) => {
    console.log(`[WebhookWorker] Job ${job.id} finished`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(
      `[WebhookWorker] Job ${job?.id} failed:`,
      err.message,
    );
  });

  worker.on('error', (err: Error) => {
    console.error('[WebhookWorker] Worker error:', err.message);
  });

  console.log('[WebhookWorker] Started, listening on queue "webhooks"');
  return worker;
}
