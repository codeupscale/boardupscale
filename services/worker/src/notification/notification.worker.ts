import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import IORedis from 'ioredis';
import { createRedisConnection } from '../redis';

// ─── Job payload types ───────────────────────────────────────────────────────

interface IssueAssignedJobData {
  userId: string;
  issueId: string;
  issueKey: string;
  issueTitle: string;
  projectId?: string;
}

interface IssueCommentedJobData {
  userIds: string[];
  commentId: string;
  issueId: string;
  issueKey: string;
  issueTitle: string;
  commenterName: string;
}

interface IssueStatusChangedJobData {
  userId: string;
  issueId: string;
  issueKey: string;
  issueTitle: string;
  oldStatus: string;
  newStatus: string;
  projectId?: string;
}

interface SprintEventJobData {
  userIds: string[];
  sprintId: string;
  sprintName: string;
  projectId: string;
  projectName: string;
}

interface IssueDueJobData {
  userId: string;
  issueId: string;
  issueKey: string;
  issueTitle: string;
  dueDate: string;
}

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, any>;
  created_at: string;
}

// ─── Redis pub/sub channel for real-time notification delivery ──────────────

const NOTIFICATION_CHANNEL = 'notifications:new';

// ─── Notification helpers ────────────────────────────────────────────────────

/**
 * Insert a single notification row and publish to Redis for real-time delivery.
 */
async function insertNotification(
  pool: Pool,
  pubClient: IORedis,
  userId: string,
  type: string,
  title: string,
  body: string,
  data: Record<string, any> = {},
): Promise<string> {
  const result = await pool.query(
    `INSERT INTO notifications (id, user_id, type, title, body, data, read_at, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, NULL, NOW())
     RETURNING id, created_at`,
    [userId, type, title, body, JSON.stringify(data)],
  );
  const row = result.rows[0];

  // Publish to Redis so the API gateway can push to WebSocket clients
  await publishNotification(pubClient, {
    id: row.id,
    user_id: userId,
    type,
    title,
    body,
    data,
    created_at: row.created_at,
  });

  return row.id;
}

/**
 * Bulk-insert notifications for multiple users and publish each to Redis.
 */
async function insertNotifications(
  pool: Pool,
  pubClient: IORedis,
  userIds: string[],
  type: string,
  title: string,
  body: string,
  data: Record<string, any> = {},
): Promise<void> {
  if (userIds.length === 0) return;

  const values: any[] = [];
  const placeholders = userIds.map((userId, i) => {
    const base = i * 5;
    values.push(userId, type, title, body, JSON.stringify(data));
    return `(gen_random_uuid(), $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, NULL, NOW())`;
  });

  const result = await pool.query(
    `INSERT INTO notifications (id, user_id, type, title, body, data, read_at, created_at)
     VALUES ${placeholders.join(', ')}
     RETURNING id, user_id, created_at`,
    values,
  );

  // Publish each notification for real-time delivery
  for (const row of result.rows) {
    await publishNotification(pubClient, {
      id: row.id,
      user_id: row.user_id,
      type,
      title,
      body,
      data,
      created_at: row.created_at,
    });
  }
}

/**
 * Publish a notification event to Redis pub/sub for the API to relay via WebSocket.
 */
async function publishNotification(
  pubClient: IORedis,
  notification: NotificationRow,
): Promise<void> {
  try {
    await pubClient.publish(
      NOTIFICATION_CHANNEL,
      JSON.stringify(notification),
    );
  } catch (err: any) {
    console.error(`[NotificationWorker] Failed to publish to Redis: ${err.message}`);
  }
}

// ─── Worker ─────────────────────────────────────────────────────────────────

export function createNotificationWorker(pool: Pool): Worker {
  // Dedicated Redis connection for pub/sub publishing
  const pubClient = createRedisConnection();

  const worker = new Worker(
    'notification',
    async (job: Job) => {
      console.log(`[NotificationWorker] Processing ${job.name} (${job.id})`);

      switch (job.name) {
        case 'issue-assigned': {
          const d = job.data as IssueAssignedJobData;
          await insertNotification(pool, pubClient, d.userId, 'issue:assigned',
            `You were assigned to ${d.issueKey}`,
            d.issueTitle,
            { issueId: d.issueId, issueKey: d.issueKey, projectId: d.projectId },
          );
          break;
        }

        case 'issue-commented': {
          const d = job.data as IssueCommentedJobData;
          await insertNotifications(pool, pubClient, d.userIds, 'comment:created',
            `${d.commenterName} commented on ${d.issueKey}`,
            d.issueTitle,
            { issueId: d.issueId, commentId: d.commentId, issueKey: d.issueKey },
          );
          break;
        }

        case 'issue-status-changed': {
          const d = job.data as IssueStatusChangedJobData;
          await insertNotification(pool, pubClient, d.userId, 'issue:status_changed',
            `${d.issueKey} moved to ${d.newStatus}`,
            `"${d.issueTitle}" changed from ${d.oldStatus} → ${d.newStatus}`,
            { issueId: d.issueId, issueKey: d.issueKey, oldStatus: d.oldStatus, newStatus: d.newStatus, projectId: d.projectId },
          );
          break;
        }

        case 'sprint-started': {
          const d = job.data as SprintEventJobData;
          await insertNotifications(pool, pubClient, d.userIds, 'sprint:started',
            `Sprint "${d.sprintName}" has started`,
            `Sprint in ${d.projectName} is now active. Check your assigned issues.`,
            { sprintId: d.sprintId, sprintName: d.sprintName, projectId: d.projectId },
          );
          break;
        }

        case 'sprint-completed': {
          const d = job.data as SprintEventJobData;
          await insertNotifications(pool, pubClient, d.userIds, 'sprint:completed',
            `Sprint "${d.sprintName}" completed`,
            `Sprint in ${d.projectName} has been completed.`,
            { sprintId: d.sprintId, sprintName: d.sprintName, projectId: d.projectId },
          );
          break;
        }

        case 'issue-due-soon': {
          const d = job.data as IssueDueJobData;
          await insertNotification(pool, pubClient, d.userId, 'issue:due_soon',
            `${d.issueKey} is due ${d.dueDate}`,
            d.issueTitle,
            { issueId: d.issueId, issueKey: d.issueKey, dueDate: d.dueDate },
          );
          break;
        }

        default:
          console.warn(`[NotificationWorker] Unknown job type: "${job.name}"`);
      }

      console.log(`[NotificationWorker] ${job.name} (${job.id}) completed`);
    },
    {
      connection: createRedisConnection() as any,
      concurrency: 10,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  );

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[NotificationWorker] ${job?.name} (${job?.id}) failed:`, err.message);
  });

  worker.on('error', (err: Error) => {
    console.error('[NotificationWorker] Worker error:', err.message);
  });

  console.log('[NotificationWorker] Started, listening on queue "notification"');
  return worker;
}
