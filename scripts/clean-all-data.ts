/**
 * clean-all-data.ts
 *
 * Wipes ALL user-generated data from the database so the team can retest
 * the full signup / onboarding flow from scratch.
 *
 * Preserved (not truncated):
 *   - migrations          (TypeORM migration history)
 *   - typeorm_metadata     (TypeORM internal metadata, if it exists)
 *   - permissions          (system seed data — resource x action pairs)
 *   - billing_plans        (system seed data — Free / Pro / Enterprise)
 *
 * System roles and role_permissions ARE truncated because they include
 * per-org custom roles.  The seed data migration re-inserts the four
 * system roles idempotently (ON CONFLICT DO NOTHING), so running
 * `npm run migration:run` after this script restores them.
 *
 * Safety:
 *   - Requires --confirm flag
 *   - Refuses to run when NODE_ENV=production
 *
 * Usage:
 *   npx ts-node scripts/clean-all-data.ts --confirm
 *
 * Environment variables:
 *   DATABASE_URL   (default: postgresql://copilot:copilot@localhost:5433/boardupscale)
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Pool } = require('pg') as { Pool: new (opts: any) => any };

// ─── Configuration ───────────────────────────────────────────────────────────

const DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://copilot:copilot@localhost:5433/boardupscale';

// Tables that must NEVER be truncated.
const PRESERVED_TABLES = new Set([
  'migrations',
  'typeorm_metadata',
  'permissions',
  'billing_plans',
]);

// Ordered list of tables to truncate.  Order does not matter because we use
// TRUNCATE ... CASCADE, but listing them explicitly makes the script
// self-documenting and the summary output deterministic.
const DATA_TABLES = [
  // ── AI / Chat ──
  'chat_feedback',
  'chat_messages',
  'chat_conversations',
  'ai_usage_log',

  // ── Jira import / migration ──
  'jira_migration_runs',
  'jira_import_jobs',
  'jira_connections',

  // ── GitHub integration ──
  'github_events',
  'github_connections',

  // ── Webhooks ──
  'webhook_deliveries',
  'webhooks',

  // ── Automation ──
  'automation_logs',
  'automation_rules',

  // ── Custom fields ──
  'custom_field_values',
  'custom_field_definitions',

  // ── Components & versions (join tables first) ──
  'issue_components',
  'components',
  'issue_versions',
  'versions',

  // ── Issues & related ──
  'work_logs',
  'issue_watchers',
  'issue_links',
  'comments',
  'attachments',
  'activities',
  'issues',
  'issue_statuses',

  // ── Sprints ──
  'sprints',

  // ── Pages / Docs ──
  'pages',

  // ── Saved views ──
  'saved_views',

  // ── Notifications ──
  'notifications',

  // ── Audit ──
  'audit_logs',

  // ── API keys ──
  'api_keys',

  // ── Auth ──
  'refresh_tokens',

  // ── Projects ──
  'project_members',
  'projects',

  // ── RBAC (per-org roles and grants) ──
  'role_permissions',
  'roles',

  // ── Billing (subscriptions, not plans) ──
  'subscriptions',

  // ── Organizations & users ──
  'organization_members',
  'organizations',
  'users',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[clean-all-data] ${msg}`);
}

function warn(msg: string) {
  console.warn(`[clean-all-data] WARNING: ${msg}`);
}

function error(msg: string) {
  console.error(`[clean-all-data] ERROR: ${msg}`);
}

// ─── Safety checks ───────────────────────────────────────────────────────────

function preflight(): boolean {
  const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase();
  if (nodeEnv === 'production' || nodeEnv === 'prod') {
    error(
      'NODE_ENV is set to "' +
        process.env.NODE_ENV +
        '". This script refuses to run against a production database.',
    );
    return false;
  }

  const hasConfirm = process.argv.includes('--confirm');
  if (!hasConfirm) {
    warn('Dry-run mode. Pass --confirm to actually truncate data.\n');
    log('The following tables would be truncated:\n');
    for (const t of DATA_TABLES) {
      log(`  - ${t}`);
    }
    log('\nThe following tables are preserved:\n');
    for (const t of PRESERVED_TABLES) {
      log(`  - ${t}`);
    }
    log('\nRun again with --confirm to execute.');
    return false;
  }

  return true;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log('Boardupscale — clean all user data');
  log('='.repeat(50));

  if (!preflight()) {
    process.exit(0);
  }

  // Mask password in log output
  const safeUrl = DB_URL.replace(/:([^@]+)@/, ':****@');
  log(`Connecting to ${safeUrl} ...`);

  const pool = new Pool({ connectionString: DB_URL });
  let client;
  try {
    client = await pool.connect();
  } catch (err: any) {
    error(`Could not connect to database: ${err.message}`);
    process.exit(1);
  }

  // Discover which of our target tables actually exist in the database.
  const { rows: existingRows } = await client.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  const existingTables = new Set(existingRows.map((r: any) => r.tablename));

  const tablesToTruncate = DATA_TABLES.filter((t) => existingTables.has(t));
  const skippedTables = DATA_TABLES.filter((t) => !existingTables.has(t));

  if (skippedTables.length > 0) {
    log(`\nSkipping ${skippedTables.length} table(s) not found in database:`);
    for (const t of skippedTables) {
      log(`  - ${t}`);
    }
  }

  // Warn about any unknown tables that are not in our list or preserved set
  const unknownTables = existingRows
    .map((r: any) => r.tablename)
    .filter((t: string) => !PRESERVED_TABLES.has(t) && !DATA_TABLES.includes(t));

  if (unknownTables.length > 0) {
    warn(
      `Found ${unknownTables.length} table(s) not in the known list (will NOT be truncated):`,
    );
    for (const t of unknownTables) {
      log(`  - ${t}`);
    }
  }

  if (tablesToTruncate.length === 0) {
    log('\nNo tables to truncate. Database is already clean.');
    client.release();
    await pool.end();
    process.exit(0);
  }

  log(`\nTruncating ${tablesToTruncate.length} table(s) ...`);
  log('-'.repeat(50));

  try {
    // Wrap everything in a transaction so it is all-or-nothing.
    await client.query('BEGIN');

    // Disable FK constraint checks for the session to allow truncation in
    // any order without dependency issues.
    await client.query('SET session_replication_role = replica');

    const summary: { table: string; status: string }[] = [];

    for (const table of tablesToTruncate) {
      try {
        await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
        summary.push({ table, status: 'OK' });
      } catch (err: any) {
        summary.push({ table, status: `FAILED: ${err.message}` });
        warn(`Failed to truncate "${table}": ${err.message}`);
      }
    }

    // Re-enable FK constraint checks.
    await client.query('SET session_replication_role = DEFAULT');

    await client.query('COMMIT');

    // ── Summary ──────────────────────────────────────────────────────────
    log('\n' + '='.repeat(50));
    log('TRUNCATION SUMMARY');
    log('='.repeat(50));

    const succeeded = summary.filter((s) => s.status === 'OK');
    const failed = summary.filter((s) => s.status !== 'OK');

    for (const s of summary) {
      const icon = s.status === 'OK' ? '[OK]' : '[!!]';
      log(`  ${icon} ${s.table.padEnd(30)} ${s.status}`);
    }

    log('-'.repeat(50));
    log(`Truncated: ${succeeded.length}  |  Failed: ${failed.length}  |  Preserved: ${PRESERVED_TABLES.size}`);
    log('');
    log('Preserved tables (untouched):');
    for (const t of PRESERVED_TABLES) {
      if (existingTables.has(t)) {
        log(`  - ${t}`);
      }
    }

    if (failed.length > 0) {
      error(`${failed.length} table(s) failed to truncate. See details above.`);
    } else {
      log('\nAll user data has been removed. The database is ready for a fresh signup/onboarding test.');
      log('System roles will be restored automatically on next API startup (migrationsRun: true).');
      log('Or run manually:  cd services/api && npm run migration:run');
    }
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    error(`Transaction failed, all changes rolled back: ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  error(`Fatal: ${err.message}`);
  process.exit(1);
});
