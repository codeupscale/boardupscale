/**
 * clear-migration-data.ts
 *
 * One-shot admin script to wipe all Jira migration data (DB rows + BullMQ jobs)
 * for a given organisation identified by member email.
 *
 * Usage (from services/worker directory):
 *   npx ts-node src/scripts/clear-migration-data.ts [email]
 *
 * Defaults to info@codeupscale.com when no argument is supplied.
 *
 * What it clears:
 *   1. All BullMQ jobs in queue "jira-migration" whose jobId matches any run belonging to the org.
 *   2. All rows in jira_migration_runs for the org (hard delete).
 *   3. All rows in jira_connections for the org (hard delete).
 *
 * Environment variables (mirrors services/worker/src/config.ts defaults):
 *   DATABASE_URL  postgresql://copilot:copilot@localhost:5433/boardupscale
 *   REDIS_URL     redis://localhost:6380
 */

import { Pool } from 'pg';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';

// ─── Configuration ────────────────────────────────────────────────────────────

// Filter --dry-run out of positional args so it doesn't get treated as email.
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const TARGET_EMAIL = positional[0] ?? 'info@codeupscale.com';
const DRY_RUN = process.argv.includes('--dry-run');

const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://copilot:copilot@localhost:5433/boardupscale';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6380';
const QUEUE_NAME = 'jira-migration';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[clear-migration] ${msg}`);
}

function warn(msg: string) {
  console.warn(`[clear-migration] ⚠  ${msg}`);
}

function success(msg: string) {
  console.log(`[clear-migration] ✓  ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log(`Target email: ${TARGET_EMAIL}`);
  log(`Mode:  ${DRY_RUN ? 'DRY-RUN (no writes)' : 'LIVE'}`);
  log(`DB:    ${DB_URL}`);
  log(`Redis: ${REDIS_URL}`);
  log('─'.repeat(60));

  // ── 1. Connect to DB ──────────────────────────────────────────────────────
  const db = new Pool({ connectionString: DB_URL });

  let client;
  try {
    client = await db.connect();
  } catch (err: any) {
    console.error(`[clear-migration] ✗ Could not connect to database: ${err.message}`);
    process.exit(1);
  }

  // ── 2. Look up organisation by member email ───────────────────────────────
  log(`Looking up organisation for ${TARGET_EMAIL}…`);

  const userResult = await client.query(
    `SELECT id, organization_id, email FROM users WHERE email = $1 LIMIT 1`,
    [TARGET_EMAIL],
  );
  const userRows = userResult.rows as Array<{ id: string; organization_id: string; email: string }>;

  if (!userRows.length) {
    warn(`No user found with email "${TARGET_EMAIL}". Nothing to clear.`);
    await client.release();
    await db.end();
    process.exit(0);
  }

  const { organization_id: orgId } = userRows[0];
  log(`Found organisation: ${orgId}`);

  // ── 3. Collect all migration run IDs for this org ─────────────────────────
  const runResult = await client.query(
    `SELECT id, status FROM jira_migration_runs WHERE organization_id = $1`,
    [orgId],
  );
  const runRows = runResult.rows as Array<{ id: string; status: string }>;

  log(`Found ${runRows.length} migration run(s) in DB.`);
  if (runRows.length) {
    for (const r of runRows) {
      log(`  run ${r.id}  status=${r.status}`);
    }
  }

  // ── 4. Remove BullMQ jobs from Redis ─────────────────────────────────────
  const redis = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const queue = new Queue(QUEUE_NAME, { connection: redis as any });

  if (runRows.length && DRY_RUN) {
    log('[dry-run] would remove BullMQ jobs + retry keys for each run above');
  }
  if (runRows.length && !DRY_RUN) {
    log('Removing BullMQ jobs from Redis…');
    for (const run of runRows) {
      // Primary job ID pattern: migration-{runId}
      const primaryJobId = `migration-${run.id}`;
      try {
        const job = await queue.getJob(primaryJobId);
        if (job) {
          const state = await job.getState();
          log(`  job ${primaryJobId}  state=${state}`);
          if (state === 'active') {
            // Active jobs cannot be removed directly; obliterate forces removal
            await job.moveToFailed(new Error('Cancelled by admin clear script'), '0', true);
            warn(`  Active job ${primaryJobId} forced to failed state.`);
          } else {
            await job.remove();
            success(`  Removed job ${primaryJobId}`);
          }
        } else {
          log(`  Job ${primaryJobId} not found in queue (already completed/removed).`);
        }
      } catch (err: any) {
        warn(`  Could not remove job ${primaryJobId}: ${err.message}`);
      }

      // Also clean up retry job IDs (migration-{runId}-retry-*) via pattern scan
      const retryPattern = `bull:${QUEUE_NAME}:migration-${run.id}-retry-*`;
      try {
        const keys = await redis.keys(retryPattern);
        if (keys.length) {
          log(`  Found ${keys.length} retry job key(s) for run ${run.id}`);
          for (const key of keys) {
            await redis.del(key);
            success(`  Deleted Redis key: ${key}`);
          }
        }
      } catch (err: any) {
        warn(`  Could not scan retry keys for run ${run.id}: ${err.message}`);
      }
    }
  }

  // Also drain the entire queue of any waiting/delayed jobs for this org
  // (catches any jobs that don't match the run ID pattern above)
  if (!DRY_RUN) {
    try {
      const waitingJobs = await queue.getWaiting(0, 200);
      const delayedJobs = await queue.getDelayed(0, 200);
      const allPending = [...waitingJobs, ...delayedJobs];
      const orgRunIds = new Set(runRows.map((r) => r.id));

      for (const job of allPending) {
        const jobRunId = (job.data as any)?.runId;
        if (jobRunId && orgRunIds.has(jobRunId)) {
          await job.remove();
          success(`  Removed pending/delayed job ${job.id} (runId=${jobRunId})`);
        }
      }
    } catch (err: any) {
      warn(`Could not scan pending/delayed jobs: ${err.message}`);
    }
  }

  await queue.close();
  await redis.quit();
  if (!DRY_RUN) success('Redis cleanup done.');

  // ── 5. Delete DB rows ─────────────────────────────────────────────────────
  if (DRY_RUN) {
    // Count what would go — staging cascades from jira_migration_runs via FK.
    const stagingRes = await client.query(
      `SELECT COUNT(*)::text AS c FROM jira_migration_attachment_staging
       WHERE organization_id = $1`,
      [orgId],
    );
    const connRes = await client.query(
      `SELECT COUNT(*)::text AS c FROM jira_connections WHERE organization_id = $1`,
      [orgId],
    );
    const stagingCount = (stagingRes.rows[0] as { c: string } | undefined)?.c ?? '0';
    const connCount = (connRes.rows[0] as { c: string } | undefined)?.c ?? '0';
    log(`[dry-run] would DELETE ${runRows.length} jira_migration_runs row(s)`);
    log(`[dry-run]   + ${stagingCount} jira_migration_attachment_staging row(s) (FK cascade)`);
    log(`[dry-run]   + ${connCount} jira_connections row(s)`);
  } else {
    log('Deleting DB rows…');

    const { rowCount: runsDeleted } = await client.query(
      `DELETE FROM jira_migration_runs WHERE organization_id = $1`,
      [orgId],
    );
    success(`Deleted ${runsDeleted ?? 0} row(s) from jira_migration_runs.`);

    const { rowCount: connsDeleted } = await client.query(
      `DELETE FROM jira_connections WHERE organization_id = $1`,
      [orgId],
    );
    success(`Deleted ${connsDeleted ?? 0} row(s) from jira_connections.`);
  }

  client.release();
  await db.end();

  log('─'.repeat(60));
  if (DRY_RUN) {
    success(`Dry-run complete for org ${orgId} (${TARGET_EMAIL}) — nothing changed.`);
  } else {
    success(`All migration data cleared for org ${orgId} (${TARGET_EMAIL}).`);
  }
}

main().catch((err) => {
  console.error('[clear-migration] Fatal error:', err);
  process.exit(1);
});
