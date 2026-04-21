# Jira Media & Attachment Migration — Design Spec

**Goal:** Fully migrate Jira issue attachments and inline images into Boardupscale (MinIO) during the Jira import pipeline, with complete resumability and robust error handling.

**Architecture:** Three interlocking changes to the worker pipeline — Phase 4 captures attachment metadata into a staging table, `adfToText()` emits inline image placeholders instead of silently dropping them, and Phase 6 is fully implemented as a resumable batch-download pipeline writing to MinIO and the `attachments` table. No schema changes to `issues.description` or `comments.content` (TEXT stays TEXT). No new NestJS modules or API endpoints — the worker uses `@aws-sdk/client-s3` and raw SQL directly.

**Tech Stack:** NestJS 11, BullMQ worker, PostgreSQL 15 (raw `pg` pool), MinIO via `@aws-sdk/client-s3`, Node.js `https`/`http` for Jira binary downloads.

---

## Files Changed

| File | Change |
|---|---|
| `services/worker/src/migration/jira-migration.processor.ts` | Phase 4 attachment capture, adfToText fix, Phase 6 full implementation, RunState new fields |
| `services/api/src/database/migrations/1744400000000-AddAttachmentStagingAndJiraId.ts` | New migration |

---

## Database Schema Changes

### New table: `jira_migration_attachment_staging`

```sql
CREATE TABLE jira_migration_attachment_staging (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_run_id    VARCHAR(36)  NOT NULL,
  jira_attachment_id  VARCHAR(100) NOT NULL,
  jira_issue_key      VARCHAR(50)  NOT NULL,
  local_issue_id      UUID         NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  download_url        TEXT         NOT NULL,
  file_name           VARCHAR(500) NOT NULL,
  mime_type           VARCHAR(255) NOT NULL,
  file_size           BIGINT       NOT NULL,
  attempt_count       SMALLINT     NOT NULL DEFAULT 0,
  downloaded_at       TIMESTAMPTZ,
  error               TEXT,
  UNIQUE (migration_run_id, jira_attachment_id)
);

CREATE INDEX idx_jira_attachment_staging_run_pending
  ON jira_migration_attachment_staging (migration_run_id, downloaded_at)
  WHERE downloaded_at IS NULL;
```

The `UNIQUE (migration_run_id, jira_attachment_id)` constraint makes Phase 4's bulk insert idempotent (`ON CONFLICT DO NOTHING`) — safe to re-run on resume. The partial index on `downloaded_at IS NULL` makes Phase 6's batch SELECT fast even on large migrations.

### New column on `attachments`

```sql
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS jira_attachment_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_attachments_jira_id
  ON attachments (jira_attachment_id)
  WHERE jira_attachment_id IS NOT NULL;
```

This allows Phase 6 to detect already-uploaded files if the staging row wasn't marked `downloaded_at` before a crash (last-resort dedup).

---

## RunState Additions

Two new counters in `RunState` (worker-internal interface):

```typescript
totalAttachments:     number;  // set at Phase 6 start from staging COUNT
processedAttachments: number;  // incremented per successfully downloaded file
```

Both flow through `updateRunProgress()` to Redis pub-sub (same channel as other phase counters) so the frontend progress UI shows real attachment progress.

---

## Phase 4 Changes (Attachment Metadata Capture)

### 1. Add `attachment` to FIELDS

```typescript
const FIELDS = [
  'summary', 'description', 'issuetype', 'priority', 'status',
  'assignee', 'reporter', 'created', 'updated', 'duedate', 'labels',
  'customfield_10016', 'customfield_10020', 'timetracking',
  'subtasks', 'parent', 'issuelinks', 'comment',
  'attachment',  // ← new
].join(',');
```

### 2. Extend `JiraApiIssue` type

```typescript
attachment?: Array<{
  id: string;
  filename: string;
  content: string;   // Direct authenticated download URL
  mimeType: string;
  size: number;
  author?: { accountId?: string; emailAddress?: string };
  created?: string;
}>;
```

### 3. Build attachment map and stage metadata after each issue batch

After each batch of issues is upserted to the `issues` table:

```typescript
// Build per-issue attachment map for ADF inline image labeling
const attachmentMapByIssueKey = new Map<string, Map<string, string>>();
for (const issue of batch) {
  const map = new Map<string, string>(); // jiraMediaId → filename
  for (const att of issue.fields.attachment ?? []) {
    map.set(att.id, att.filename);
  }
  attachmentMapByIssueKey.set(issue.key, map);
}

// Bulk-insert staging rows (idempotent via ON CONFLICT DO NOTHING)
const stagingRows = batch.flatMap(issue =>
  (issue.fields.attachment ?? [])
    .filter(att => state.jiraIssueKeyToLocalId[issue.key]) // skip if issue not in DB
    .map(att => [
      state.id,
      att.id,
      issue.key,
      state.jiraIssueKeyToLocalId[issue.key],
      att.content,
      att.filename,
      att.mimeType,
      att.size,
    ])
);

if (stagingRows.length > 0) {
  const placeholders = stagingRows.map(
    (_, i) => `($${i*8+1},$${i*8+2},$${i*8+3},$${i*8+4},$${i*8+5},$${i*8+6},$${i*8+7},$${i*8+8})`
  ).join(',');
  await client.query(
    `INSERT INTO jira_migration_attachment_staging
       (migration_run_id, jira_attachment_id, jira_issue_key, local_issue_id,
        download_url, file_name, mime_type, file_size)
     VALUES ${placeholders}
     ON CONFLICT (migration_run_id, jira_attachment_id) DO NOTHING`,
    stagingRows.flat(),
  );
}
```

Pass `attachmentMapByIssueKey.get(issue.key)` to `adfToText()` when converting issue descriptions.

---

## ADF Enhancement — `adfToText()`

Updated signature:

```typescript
function adfToText(node: any, attachmentMap?: Map<string, string>): string
```

New cases added to the switch statement:

```typescript
case 'mediaSingle':
  // Container node — delegate to child media nodes
  return parts.join('') + '\n';

case 'media': {
  if (node.attrs?.type === 'external') {
    // Remote URL not hosted by Jira — keep as a readable reference
    return `[🔗 image: ${node.attrs.url ?? 'external image'}]\n`;
  }
  // Jira-hosted file — look up filename from the attachment map
  const filename = attachmentMap?.get(String(node.attrs?.id)) ?? 'attachment';
  return `[📎 image: ${filename}]\n`;
}

case 'image':
  // Legacy Jira Server image node with direct src attribute
  return `[📎 image: ${node.attrs?.src ?? 'image'}]\n`;

case 'emoji':
  return node.attrs?.text ?? '';

case 'mention':
  return `@${node.attrs?.text ?? 'user'}`;

case 'inlineCard':
  // Jira smart link — keep the URL
  return node.attrs?.url ?? '';
```

**Callers:**
- **Phase 4 (issue descriptions):** `adfToText(issue.fields.description, attachmentMapByIssueKey.get(issue.key))`
- **Phase 5 (comments):** `adfToText(comment.body)` — no map passed; emits generic `[📎 image: attachment]`

---

## Phase 6 — Full Implementation

### Initialisation

```typescript
async function runAttachmentsPhase(
  client: PoolClient,
  state: RunState,
  io: IORedis | null,
): Promise<void> {
  if (!state.options?.importAttachments) {
    await updateRunProgress(client, state.id, { completedPhase: PHASE_ATTACHMENTS }, io);
    return;
  }

  // Verify MinIO is reachable before starting (fail fast)
  const s3 = initMinIOClient();
  await ensureMinIOBucket(s3, MINIO_BUCKET);

  // Total count for progress UI
  const { rows: [{ count }] } = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM jira_migration_attachment_staging
     WHERE migration_run_id = $1 AND downloaded_at IS NULL`,
    [state.id],
  );
  state.totalAttachments = parseInt(count, 10);
  state.processedAttachments = 0;
  await updateRunProgress(client, state.id, {
    totalAttachments: state.totalAttachments,
    processedAttachments: 0,
  }, io);

  // Build auth header (same pattern as jiraGet)
  const credentials = await loadCredentials(client, state.connectionId, state.organizationId);
  const authHeader = credentials.email
    ? `Basic ${Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64')}`
    : `Bearer ${credentials.apiToken}`;

  // Main batch loop
  const BATCH_SIZE = 20;
  const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

  while (true) {
    const { rows: batch } = await client.query(
      `SELECT * FROM jira_migration_attachment_staging
       WHERE migration_run_id = $1
         AND downloaded_at IS NULL
         AND attempt_count < 3
       ORDER BY jira_issue_key, file_name
       LIMIT $2`,
      [state.id, BATCH_SIZE],
    );

    if (batch.length === 0) break;

    for (const row of batch) {
      // Increment attempt count first (so a crash mid-download still counts as an attempt)
      await client.query(
        `UPDATE jira_migration_attachment_staging
         SET attempt_count = attempt_count + 1
         WHERE id = $1`,
        [row.id],
      );

      // Skip files over size limit
      if (row.file_size > MAX_FILE_BYTES) {
        const msg = `Attachment "${row.file_name}" skipped — ${Math.round(row.file_size / 1024 / 1024)}MB exceeds 50MB limit`;
        addError(state, msg);
        await client.query(
          `UPDATE jira_migration_attachment_staging SET error = $1 WHERE id = $2`,
          [msg, row.id],
        );
        continue;
      }

      // Download from Jira
      let buffer: Buffer;
      try {
        buffer = await downloadAttachmentBinary(row.download_url, authHeader, MAX_FILE_BYTES);
      } catch (err) {
        const msg = `Failed to download "${row.file_name}": ${(err as Error).message}`;
        addError(state, msg);
        await client.query(
          `UPDATE jira_migration_attachment_staging SET error = $1 WHERE id = $2`,
          [msg, row.id],
        );
        continue;
      }

      // Upload to MinIO
      const storageKey = `jira/${state.id}/${uuidv4()}-${sanitizeFileName(row.file_name)}`;
      try {
        await s3.send(new PutObjectCommand({
          Bucket: MINIO_BUCKET,
          Key: storageKey,
          Body: buffer,
          ContentType: row.mime_type,
          ContentLength: buffer.length,
        }));
      } catch (err) {
        const msg = `MinIO upload failed for "${row.file_name}": ${(err as Error).message}`;
        addError(state, msg);
        await client.query(
          `UPDATE jira_migration_attachment_staging SET error = $1 WHERE id = $2`,
          [msg, row.id],
        );
        continue;
      }

      // Insert attachment record (skip if already uploaded — last-resort dedup)
      await client.query(
        `INSERT INTO attachments
           (id, issue_id, uploaded_by, file_name, file_size, mime_type,
            storage_key, storage_bucket, jira_attachment_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT DO NOTHING`,
        [
          uuidv4(),
          row.local_issue_id,
          state.triggeredById,
          row.file_name,
          buffer.length,
          row.mime_type,
          storageKey,
          MINIO_BUCKET,
          row.jira_attachment_id,
        ],
      );

      // Mark staging row complete
      await client.query(
        `UPDATE jira_migration_attachment_staging SET downloaded_at = NOW() WHERE id = $1`,
        [row.id],
      );

      state.processedAttachments++;
      await updateRunProgress(client, state.id, {
        processedAttachments: state.processedAttachments,
      }, io);
    }
  }

  await updateRunProgress(client, state.id, { completedPhase: PHASE_ATTACHMENTS }, io);
}
```

### `downloadAttachmentBinary()` helper

```typescript
async function downloadAttachmentBinary(
  url: string,
  authHeader: string,
  maxBytes: number,
  attempt = 1,
): Promise<Buffer> {
  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === 'https:';
  const transport = isHttps ? https : http;
  const originalHost = parsedUrl.hostname;

  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: '*/*',
      },
    };

    const req = transport.request(options, (res) => {
      // Handle redirects (up to 5 hops)
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        if (attempt > 5) { reject(new Error('Too many redirects')); return; }
        const redirectUrl = res.headers.location!;
        const redirectParsed = new URL(redirectUrl, url);
        // Only forward auth header to same origin — never to third-party CDN
        const nextAuth = redirectParsed.hostname === originalHost ? authHeader : '';
        downloadAttachmentBinary(redirectUrl, nextAuth, maxBytes, attempt + 1)
          .then(resolve).catch(reject);
        res.resume();
        return;
      }

      if (res.statusCode === 429 && attempt <= 4) {
        const delay = Math.pow(2, attempt - 1) * 500; // 500ms, 1s, 2s, 4s
        res.resume();
        setTimeout(() => {
          downloadAttachmentBinary(url, authHeader, maxBytes, attempt + 1)
            .then(resolve).catch(reject);
        }, delay);
        return;
      }

      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }

      const chunks: Buffer[] = [];
      let received = 0;

      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > maxBytes) {
          req.destroy();
          reject(new Error(`Response exceeded ${maxBytes} bytes`));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', (err) => {
      if (attempt <= 3) {
        setTimeout(() => {
          downloadAttachmentBinary(url, authHeader, maxBytes, attempt + 1)
            .then(resolve).catch(reject);
        }, 1000);
      } else {
        reject(err);
      }
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Download timed out (30s)'));
    });

    req.end();
  });
}
```

### `initMinIOClient()` helper

```typescript
function initMinIOClient(): S3Client {
  const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  const port = process.env.MINIO_PORT ?? '9000';
  const useSSL = process.env.MINIO_USE_SSL === 'true';
  return new S3Client({
    endpoint: `${useSSL ? 'https' : 'http'}://${endpoint}:${port}`,
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? '',
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? '',
    },
    forcePathStyle: true,
  });
}

const MINIO_BUCKET = process.env.MINIO_BUCKET ?? 'boardupscale';

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}
```

---

## Edge Case Matrix

| Scenario | Handling |
|---|---|
| `importAttachments = false` | Phase 6 exits immediately, no staging inserts in Phase 4 |
| File > 50 MB | Skip with `errorLog` warning; staging row marked `error` |
| Jira 429 rate limit | Exponential backoff: 500ms → 1s → 2s → 4s (max 4 retries per file) |
| CDN redirect (302) | Follow redirect; auth header stripped when crossing to different hostname |
| Network timeout (>30s) | Retry up to 3×; if all fail, mark `error` and continue |
| MinIO unavailable at start | `ensureMinIOBucket()` throws → phase fails with clear error; resumable |
| Worker crash mid-phase | `downloaded_at IS NULL` filter picks up all unfinished rows on next run |
| Already-uploaded file (dedup) | `ON CONFLICT DO NOTHING` on `attachments` prevents duplicate rows |
| Duplicate attachment across issues | Each issue gets its own `attachments` row; staging dedup by `(run_id, jira_attachment_id)` |
| Jira Cloud vs Server URLs | `attachment.content` is the correct authenticated URL for both; used directly |
| External CDN images in ADF | Emitted as `[🔗 image: url]` text; no download attempted |
| Zero attachments in migration | Phase 6 completes instantly; `totalAttachments = 0` |
| Comment with inline image | `adfToText(body)` without map emits `[📎 image: attachment]` generic placeholder |
| Issue description with inline image | `adfToText(desc, attachmentMap)` emits `[📎 image: actual-filename.png]` |
| `attempt_count >= 3` | Row is skipped permanently (not retried); surfaces in `errorLog` |

---

## Out of Scope

- ADF-native storage (JSONB columns, rich-text frontend renderer) — separate initiative
- Comment-level attachment linking (`comment_id` on `Attachment`) — comments in Jira Cloud don't own attachments; all attachments belong to the issue
- Frontend changes beyond what automatically flows through existing progress pub-sub
- Attachment download for Jira Server using cookie-based auth
