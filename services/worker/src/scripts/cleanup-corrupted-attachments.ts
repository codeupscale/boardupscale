/**
 * cleanup-corrupted-attachments.ts
 *
 * One-shot admin script to remove Jira-migrated attachments that ended up as
 * 0-byte "ghosts" in the DB + MinIO. These render as broken thumbnails with
 * "0 B" size in the UI. Production bug fix follow-up — prevents the UI from
 * showing corrupt rows that a prior migration run inserted.
 *
 * Targets: attachments rows where jira_attachment_id IS NOT NULL AND file_size = 0.
 * These are provably migration artefacts (never user-uploaded via the web UI).
 *
 * For each match:
 *   1. Best-effort DELETE the MinIO object (storage_bucket + storage_key).
 *   2. Hard-delete the DB row.
 *
 * Usage (from services/worker directory):
 *   npx ts-node src/scripts/cleanup-corrupted-attachments.ts [--dry-run]
 *
 * Environment (mirrors worker runtime):
 *   DATABASE_URL      postgresql://...
 *   MINIO_ENDPOINT    hostname
 *   MINIO_PORT        9000
 *   MINIO_USE_SSL     true|false
 *   MINIO_ACCESS_KEY  ...
 *   MINIO_SECRET_KEY  ...
 */

import { Pool } from 'pg';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

// ─── Config ───────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

const DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://copilot:copilot@localhost:5433/boardupscale';

function initS3(): S3Client {
  const accessKeyId = process.env.MINIO_ACCESS_KEY;
  const secretAccessKey = process.env.MINIO_SECRET_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY must be set');
  }
  const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  const port = process.env.MINIO_PORT ?? '9000';
  const useSSL = process.env.MINIO_USE_SSL === 'true';
  const scheme = useSSL ? 'https' : 'http';
  return new S3Client({
    endpoint: `${scheme}://${endpoint}:${port}`,
    region: 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(`[cleanup-attachments] ${msg}`); }
function warn(msg: string) { console.warn(`[cleanup-attachments] ⚠  ${msg}`); }

interface CorruptRow {
  id: string;
  issue_id: string;
  file_name: string;
  storage_bucket: string;
  storage_key: string;
  jira_attachment_id: string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log(`Mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'LIVE'}`);
  log(`DB:   ${DB_URL}`);
  log('─'.repeat(60));

  const db = new Pool({ connectionString: DB_URL });
  const s3 = DRY_RUN ? null : initS3();

  try {
    const { rows } = await db.query<CorruptRow>(
      `SELECT id, issue_id, file_name,
              storage_bucket, storage_key, jira_attachment_id
       FROM attachments
       WHERE jira_attachment_id IS NOT NULL
         AND file_size = 0
       ORDER BY created_at`,
    );

    log(`Found ${rows.length} corrupt (0-byte, Jira-migrated) attachment rows`);

    if (rows.length === 0) {
      log('Nothing to clean up. ✓');
      return;
    }

    let deletedFromMinIO = 0;
    let deletedFromDB = 0;
    let minIOFailures = 0;
    let dbFailures = 0;

    for (const row of rows) {
      const label = `"${row.file_name}" (id=${row.id}, jira=${row.jira_attachment_id})`;

      // ── 1. Best-effort MinIO delete ────────────────────────────────────────
      if (DRY_RUN) {
        log(`[dry-run] would DELETE MinIO ${row.storage_bucket}/${row.storage_key}`);
      } else {
        try {
          await s3!.send(new DeleteObjectCommand({
            Bucket: row.storage_bucket,
            Key: row.storage_key,
          }));
          deletedFromMinIO++;
        } catch (err: any) {
          minIOFailures++;
          warn(`MinIO delete failed for ${label}: ${err.message}`);
          // Continue to DB delete anyway — the UI sees DB rows, not MinIO objects.
        }
      }

      // ── 2. Hard-delete the DB row ──────────────────────────────────────────
      if (DRY_RUN) {
        log(`[dry-run] would DELETE attachments row ${row.id}`);
      } else {
        try {
          await db.query(`DELETE FROM attachments WHERE id = $1`, [row.id]);
          deletedFromDB++;
        } catch (err: any) {
          dbFailures++;
          warn(`DB delete failed for ${label}: ${err.message}`);
        }
      }
    }

    log('─'.repeat(60));
    log(`Summary:`);
    log(`  Rows matched:        ${rows.length}`);
    log(`  MinIO objects removed: ${deletedFromMinIO} (failures: ${minIOFailures})`);
    log(`  DB rows removed:       ${deletedFromDB} (failures: ${dbFailures})`);
    if (DRY_RUN) log('  (dry-run — nothing actually changed)');
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('[cleanup-attachments] FATAL:', err);
  process.exit(1);
});
