import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import IORedis from 'ioredis';
import { createRedisConnection } from '../redis';

// ─── Job payload types ───────────────────────────────────────────────────────

interface NotifyBatchJobData {
  organizationId: string;
  userIds: string[];
  type: string;
  title: string;
  body?: string;
  data?: Record<string, any>;
}

interface IssueAssignedJobData {
  organizationId: string;
  userId: string;
  issueId: string;
  issueKey: string;
  issueTitle: string;
  projectId?: string;
}

interface IssueCommentedJobData {
  organizationId: string;
  userIds: string[];
  commentId: string;
  issueId: string;
  issueKey: string;
  issueTitle: string;
  commenterName: string;
}

interface IssueStatusChangedJobData {
  organizationId: string;
  userId: string;
  issueId: string;
  issueKey: string;
  issueTitle: string;
  oldStatus: string;
  newStatus: string;
  projectId?: string;
}

interface SprintEventJobData {
  organizationId: string;
  userIds: string[];
  sprintId: string;
  sprintName: string;
  projectId: string;
  projectName: string;
}

interface IssueDueJobData {
  organizationId: string;
  userId: string;
  issueId: string;
  issueKey: string;
  issueTitle: string;
  dueDate: string;
}

interface NotificationRow {
  id: string;
  user_id: string;
  organization_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, any>;
  created_at: string;
  unread_count?: number;
}

const NOTIFICATION_CHANNEL = 'notifications:new';

async function getUnreadCountsByUser(
  pool: Pool,
  organizationId: string,
  userIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (userIds.length === 0) return counts;

  const result = await pool.query(
    `SELECT user_id, COUNT(*)::int AS count
     FROM notifications
     WHERE organization_id = $1
       AND user_id = ANY($2::uuid[])
       AND read_at IS NULL
     GROUP BY user_id`,
    [organizationId, userIds],
  );

  for (const row of result.rows) {
    counts.set(row.user_id, row.count);
  }
  return counts;
}

async function insertNotification(
  pool: Pool,
  pubClient: IORedis,
  organizationId: string,
  userId: string,
  type: string,
  title: string,
  body: string,
  data: Record<string, any> = {},
): Promise<string> {
  const payload = { ...data, organizationId };
  const result = await pool.query(
    `INSERT INTO notifications (id, organization_id, user_id, type, title, body, data, read_at, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, NULL, NOW())
     RETURNING id, created_at`,
    [organizationId, userId, type, title, body, JSON.stringify(payload)],
  );
  const row = result.rows[0];
  const unreadCounts = await getUnreadCountsByUser(pool, organizationId, [userId]);

  await publishNotification(pubClient, {
    id: row.id,
    user_id: userId,
    organization_id: organizationId,
    type,
    title,
    body,
    data: payload,
    created_at: row.created_at,
    unread_count: unreadCounts.get(userId) ?? 0,
  });

  return row.id;
}

/**
 * Bulk insert for fan-out jobs (notify-batch).
 *
 * IMPORTANT: Recipients must already be filtered for inApp preference by
 * NotificationsService.notify() before enqueue. This worker does not re-check
 * prefs — never enqueue notify-batch with raw unfiltered user IDs.
 */
async function insertNotifications(
  pool: Pool,
  pubClient: IORedis,
  organizationId: string,
  userIds: string[],
  type: string,
  title: string,
  body: string,
  data: Record<string, any> = {},
): Promise<void> {
  if (userIds.length === 0) return;

  const payload = { ...data, organizationId };
  const values: any[] = [];
  const placeholders = userIds.map((userId, i) => {
    const base = i * 6;
    values.push(organizationId, userId, type, title, body, JSON.stringify(payload));
    return `(gen_random_uuid(), $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::jsonb, NULL, NOW())`;
  });

  const result = await pool.query(
    `INSERT INTO notifications (id, organization_id, user_id, type, title, body, data, read_at, created_at)
     VALUES ${placeholders.join(', ')}
     RETURNING id, user_id, created_at`,
    values,
  );

  const unreadCounts = await getUnreadCountsByUser(
    pool,
    organizationId,
    result.rows.map((row: { user_id: string }) => row.user_id),
  );

  for (const row of result.rows) {
    await publishNotification(pubClient, {
      id: row.id,
      user_id: row.user_id,
      organization_id: organizationId,
      type,
      title,
      body,
      data: payload,
      created_at: row.created_at,
      unread_count: unreadCounts.get(row.user_id) ?? 0,
    });
  }
}

async function publishNotification(
  pubClient: IORedis,
  notification: NotificationRow,
): Promise<void> {
  try {
    await pubClient.publish(NOTIFICATION_CHANNEL, JSON.stringify(notification));
  } catch (err: any) {
    console.error(`[NotificationWorker] Failed to publish to Redis: ${err.message}`);
  }
}

export function createNotificationWorker(pool: Pool): Worker {
  const pubClient = createRedisConnection();

  const worker = new Worker(
    'notification',
    async (job: Job) => {
      console.log(`[NotificationWorker] Processing ${job.name} (${job.id})`);

      switch (job.name) {
        case 'notify-batch': {
          const d = job.data as NotifyBatchJobData;
          if (!d.organizationId || !Array.isArray(d.userIds)) {
            throw new Error('notify-batch requires organizationId and userIds');
          }
          await insertNotifications(
            pool,
            pubClient,
            d.organizationId,
            d.userIds,
            d.type,
            d.title,
            d.body || '',
            d.data || {},
          );
          break;
        }

        case 'issue-assigned': {
          const d = job.data as IssueAssignedJobData;
          await insertNotification(
            pool,
            pubClient,
            d.organizationId,
            d.userId,
            'issue:assigned',
            `You were assigned to ${d.issueKey}`,
            d.issueTitle,
            { issueId: d.issueId, issueKey: d.issueKey, projectId: d.projectId },
          );
          break;
        }

        case 'issue-commented': {
          const d = job.data as IssueCommentedJobData;
          await insertNotifications(
            pool,
            pubClient,
            d.organizationId,
            d.userIds,
            'comment:created',
            `${d.commenterName} commented on ${d.issueKey}`,
            d.issueTitle,
            { issueId: d.issueId, commentId: d.commentId, issueKey: d.issueKey },
          );
          break;
        }

        case 'issue-status-changed': {
          const d = job.data as IssueStatusChangedJobData;
          await insertNotification(
            pool,
            pubClient,
            d.organizationId,
            d.userId,
            'issue:status_changed',
            `${d.issueKey} moved to ${d.newStatus}`,
            `"${d.issueTitle}" changed from ${d.oldStatus} → ${d.newStatus}`,
            {
              issueId: d.issueId,
              issueKey: d.issueKey,
              oldStatus: d.oldStatus,
              newStatus: d.newStatus,
              projectId: d.projectId,
            },
          );
          break;
        }

        case 'sprint-started': {
          const d = job.data as SprintEventJobData;
          await insertNotifications(
            pool,
            pubClient,
            d.organizationId,
            d.userIds,
            'sprint:started',
            `Sprint "${d.sprintName}" has started`,
            `Sprint in ${d.projectName} is now active. Check your assigned issues.`,
            { sprintId: d.sprintId, sprintName: d.sprintName, projectId: d.projectId },
          );
          break;
        }

        case 'sprint-completed': {
          const d = job.data as SprintEventJobData;
          await insertNotifications(
            pool,
            pubClient,
            d.organizationId,
            d.userIds,
            'sprint:completed',
            `Sprint "${d.sprintName}" completed`,
            `Sprint in ${d.projectName} has been completed.`,
            { sprintId: d.sprintId, sprintName: d.sprintName, projectId: d.projectId },
          );
          break;
        }

        case 'issue-due-soon': {
          const d = job.data as IssueDueJobData;
          await insertNotification(
            pool,
            pubClient,
            d.organizationId,
            d.userId,
            'issue:due_soon',
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
