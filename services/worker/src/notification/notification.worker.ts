import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import { createRedisConnection } from '../redis';

// ─── Job payload types ───────────────────────────────────────────────────────

interface IssueAssignedJobData {
  userId: string;
  issueId: string;
  issueKey: string;
  issueTitle: string;
}

interface IssueCommentedJobData {
  userIds: string[];
  commentId: string;
  issueKey: string;
  issueTitle: string;
  commenterName: string;
}

interface IssueStatusChangedJobData {
  userId: string;
  issueKey: string;
  issueTitle: string;
  oldStatus: string;
  newStatus: string;
}

interface SprintStartedJobData {
  userIds: string[];
  sprintName: string;
  projectName: string;
}

// ─── Notification helpers ────────────────────────────────────────────────────

/**
 * Insert a single notification row into the notifications table.
 *
 * Expected schema:
 *   notifications(id uuid default gen_random_uuid(), user_id uuid, type text,
 *                 title text, body text, metadata jsonb, read boolean default false,
 *                 created_at timestamptz default now())
 */
async function insertNotification(
  pool: Pool,
  userId: string,
  type: string,
  title: string,
  body: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, metadata, read, created_at)
     VALUES ($1, $2, $3, $4, $5, false, NOW())`,
    [userId, type, title, body, JSON.stringify(metadata)]
  );
}

/**
 * Bulk-insert notifications for multiple users in a single query.
 */
async function insertNotifications(
  pool: Pool,
  userIds: string[],
  type: string,
  title: string,
  body: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  if (userIds.length === 0) return;

  // Build parameterised values: ($1,$2,$3,$4,$5,false,NOW()), ($6,$7,...) ...
  const values: any[] = [];
  const placeholders = userIds.map((userId, i) => {
    const base = i * 5;
    values.push(userId, type, title, body, JSON.stringify(metadata));
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, false, NOW())`;
  });

  await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, metadata, read, created_at)
     VALUES ${placeholders.join(', ')}`,
    values
  );
}

// ─── Worker ─────────────────────────────────────────────────────────────────

export function createNotificationWorker(pool: Pool): Worker {
  const worker = new Worker(
    'notification',
    async (job: Job) => {
      console.log(`[NotificationWorker] Processing job ${job.id} type="${job.name}"`);

      switch (job.name) {
        case 'issue-assigned': {
          const data = job.data as IssueAssignedJobData;

          await insertNotification(
            pool,
            data.userId,
            'issue-assigned',
            `You were assigned to ${data.issueKey}`,
            `You have been assigned to: ${data.issueTitle}`,
            {
              issueId: data.issueId,
              issueKey: data.issueKey,
              issueTitle: data.issueTitle,
            }
          );

          console.log(
            `[NotificationWorker] issue-assigned notification inserted for user ${data.userId} (${data.issueKey})`
          );
          break;
        }

        case 'issue-commented': {
          const data = job.data as IssueCommentedJobData;

          await insertNotifications(
            pool,
            data.userIds,
            'issue-commented',
            `${data.commenterName} commented on ${data.issueKey}`,
            `New comment on: ${data.issueTitle}`,
            {
              commentId: data.commentId,
              issueKey: data.issueKey,
              issueTitle: data.issueTitle,
              commenterName: data.commenterName,
            }
          );

          console.log(
            `[NotificationWorker] issue-commented notifications inserted for ${data.userIds.length} user(s) (${data.issueKey})`
          );
          break;
        }

        case 'issue-status-changed': {
          const data = job.data as IssueStatusChangedJobData;

          await insertNotification(
            pool,
            data.userId,
            'issue-status-changed',
            `${data.issueKey} moved to ${data.newStatus}`,
            `"${data.issueTitle}" status changed from ${data.oldStatus} to ${data.newStatus}`,
            {
              issueKey: data.issueKey,
              issueTitle: data.issueTitle,
              oldStatus: data.oldStatus,
              newStatus: data.newStatus,
            }
          );

          console.log(
            `[NotificationWorker] issue-status-changed notification inserted for user ${data.userId} (${data.issueKey}: ${data.oldStatus} -> ${data.newStatus})`
          );
          break;
        }

        case 'sprint-started': {
          const data = job.data as SprintStartedJobData;

          await insertNotifications(
            pool,
            data.userIds,
            'sprint-started',
            `Sprint "${data.sprintName}" has started`,
            `The sprint "${data.sprintName}" in project ${data.projectName} has started. Check your assigned issues and get to work!`,
            {
              sprintName: data.sprintName,
              projectName: data.projectName,
            }
          );

          console.log(
            `[NotificationWorker] sprint-started notifications inserted for ${data.userIds.length} user(s) (sprint: ${data.sprintName})`
          );
          break;
        }

        default:
          throw new Error(`[NotificationWorker] Unknown job type: "${job.name}"`);
      }

      console.log(`[NotificationWorker] Job ${job.id} (${job.name}) completed`);
    },
    {
      connection: createRedisConnection() as any,
      concurrency: 10,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    }
  );

  worker.on('completed', (job: Job) => {
    console.log(`[NotificationWorker] Job ${job.id} (${job.name}) finished`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[NotificationWorker] Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  worker.on('error', (err: Error) => {
    console.error('[NotificationWorker] Worker error:', err.message);
  });

  console.log('[NotificationWorker] Started, listening on queue "notification"');
  return worker;
}
