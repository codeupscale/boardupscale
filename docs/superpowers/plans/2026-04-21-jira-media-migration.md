# Jira Media & Attachment Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully implement Jira attachment migration — Phase 4 captures attachment metadata into a staging table, `adfToText()` emits inline image placeholders, and Phase 6 is a resumable batch-download pipeline that writes files to MinIO and the `attachments` table.

**Architecture:** Three changes to `jira-migration.processor.ts` (the worker's 2291-line monolithic processor): (1) add `attachment` to Phase 4's FIELDS and bulk-insert metadata into `jira_migration_attachment_staging`; (2) upgrade `adfToText()` to handle media/image nodes; (3) fully implement `runAttachmentsPhase()` using `@aws-sdk/client-s3` directly (worker has no NestJS DI — it uses raw `pg` pool + direct env config). One new TypeORM migration adds the staging table, a `jira_attachment_id` column on `attachments`, and `total_attachments`/`processed_attachments` columns on `jira_migration_runs`.

**Tech Stack:** BullMQ worker (Node.js 20), `pg` raw pool, `@aws-sdk/client-s3` (new dep), Node.js `https`/`http` for binary downloads, PostgreSQL 15, MinIO (S3-compatible).

---

## File Map

| File | Change |
|---|---|
| `services/api/src/database/migrations/1744400000000-AddAttachmentStaging.ts` | **Create** — staging table, jira_attachment_id col, attachment counter cols |
| `services/worker/package.json` | **Modify** — add `@aws-sdk/client-s3` dependency |
| `services/worker/src/migration/jira-migration.processor.ts` | **Modify** — RunState, loadRun, updateRunProgress, FIELDS, JiraApiAttachment type, Phase 4 staging insert, adfToText, Phase 6 full impl + helpers |
| `services/api/src/modules/migration/migration.service.spec.ts` | **Modify** — add test for adfToText media node handling (via worker unit test file) |
| `services/worker/src/migration/adf.spec.ts` | **Create** — unit tests for `adfToText` media/image handling |

---

## Task 1: DB Migration — Staging Table + Counter Columns

**Files:**
- Create: `services/api/src/database/migrations/1744400000000-AddAttachmentStaging.ts`

- [ ] **Step 1: Write the migration file**

```typescript
// services/api/src/database/migrations/1744400000000-AddAttachmentStaging.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttachmentStaging1744400000000 implements MigrationInterface {
  name = 'AddAttachmentStaging1744400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Staging table for Jira attachment metadata captured in Phase 4
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "jira_migration_attachment_staging" (
        "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
        "migration_run_id"    VARCHAR(36)  NOT NULL,
        "jira_attachment_id"  VARCHAR(100) NOT NULL,
        "jira_issue_key"      VARCHAR(50)  NOT NULL,
        "local_issue_id"      UUID         NOT NULL
          REFERENCES "issues"("id") ON DELETE CASCADE,
        "download_url"        TEXT         NOT NULL,
        "file_name"           VARCHAR(500) NOT NULL,
        "mime_type"           VARCHAR(255) NOT NULL,
        "file_size"           BIGINT       NOT NULL,
        "attempt_count"       SMALLINT     NOT NULL DEFAULT 0,
        "downloaded_at"       TIMESTAMPTZ,
        "error"               TEXT,
        CONSTRAINT "pk_jira_attachment_staging"
          PRIMARY KEY ("id"),
        CONSTRAINT "uq_jira_attachment_staging_run_att"
          UNIQUE ("migration_run_id", "jira_attachment_id")
      )
    `);

    // Partial index for Phase 6's batch SELECT — only pending rows
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_jira_attachment_staging_pending"
        ON "jira_migration_attachment_staging" ("migration_run_id", "downloaded_at")
        WHERE "downloaded_at" IS NULL
    `);

    // 2. jira_attachment_id on attachments — enables last-resort dedup on retry
    await queryRunner.query(`
      ALTER TABLE "attachments"
        ADD COLUMN IF NOT EXISTS "jira_attachment_id" VARCHAR(100)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_attachments_jira_id"
        ON "attachments" ("jira_attachment_id")
        WHERE "jira_attachment_id" IS NOT NULL
    `);

    // 3. Attachment progress counters on jira_migration_runs
    await queryRunner.query(`
      ALTER TABLE "jira_migration_runs"
        ADD COLUMN IF NOT EXISTS "total_attachments"     INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "processed_attachments" INT NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "jira_migration_runs" DROP COLUMN IF EXISTS "processed_attachments"`);
    await queryRunner.query(`ALTER TABLE "jira_migration_runs" DROP COLUMN IF EXISTS "total_attachments"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_attachments_jira_id"`);
    await queryRunner.query(`ALTER TABLE "attachments" DROP COLUMN IF EXISTS "jira_attachment_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_jira_attachment_staging_pending"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "jira_migration_attachment_staging"`);
  }
}
```

- [ ] **Step 2: Run the migration**

```bash
cd services/api
npm run migration:run
```

Expected: output ends with `Migration AddAttachmentStaging1744400000000 has been executed successfully.`

- [ ] **Step 3: Verify tables and columns exist**

```bash
cd services/api
npx ts-node -e "
const { DataSource } = require('typeorm');
const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, entities: [] });
ds.initialize().then(async () => {
  const [r1] = await ds.query(\"SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'jira_migration_attachment_staging'\");
  const [r2] = await ds.query(\"SELECT column_name FROM information_schema.columns WHERE table_name = 'attachments' AND column_name = 'jira_attachment_id'\");
  const [r3] = await ds.query(\"SELECT column_name FROM information_schema.columns WHERE table_name = 'jira_migration_runs' AND column_name = 'total_attachments'\");
  console.log('staging:', r1.count, 'jira_attachment_id:', r2?.column_name, 'total_attachments:', r3?.column_name);
  await ds.destroy();
});
"
```

Expected: `staging: 1  jira_attachment_id: jira_attachment_id  total_attachments: total_attachments`

- [ ] **Step 4: Commit**

```bash
git add services/api/src/database/migrations/1744400000000-AddAttachmentStaging.ts
git commit -m "feat: add attachment staging table and counter columns for Jira media migration"
```

---

## Task 2: Add `@aws-sdk/client-s3` to Worker

**Files:**
- Modify: `services/worker/package.json`

- [ ] **Step 1: Install the SDK**

```bash
cd services/worker
npm install @aws-sdk/client-s3@^3.600.0
```

Expected: `added X packages` (no errors). The `@aws-sdk/client-s3` package appears in `package.json` under `dependencies`.

- [ ] **Step 2: Verify it resolves**

```bash
cd services/worker
node -e "const { S3Client } = require('@aws-sdk/client-s3'); console.log('ok', typeof S3Client);"
```

Expected: `ok function`

- [ ] **Step 3: Commit**

```bash
git add services/worker/package.json services/worker/package-lock.json
git commit -m "feat: add @aws-sdk/client-s3 to worker for attachment upload"
```

---

## Task 3: `RunState`, `loadRun`, `updateRunProgress` — Attachment Counters

**Files:**
- Modify: `services/worker/src/migration/jira-migration.processor.ts` (lines 64–117, 190–230, 354–430)

- [ ] **Step 1: Add `totalAttachments` and `processedAttachments` to `RunState`**

In `jira-migration.processor.ts`, find the `RunState` interface (line ~64). After the `totalComments`/`processedComments` pair add two new fields:

```typescript
  totalComments: number;
  processedComments: number;
  // ↓ new
  totalAttachments: number;
  processedAttachments: number;
```

- [ ] **Step 2: Extend `loadRun` to read the new columns**

Find `loadRun` (line ~190). In the SELECT query, after `total_comments AS "totalComments", processed_comments AS "processedComments"` add:

```typescript
            total_attachments AS "totalAttachments",
            processed_attachments AS "processedAttachments",
```

- [ ] **Step 3: Extend `updateRunProgress` to write the new columns**

Find `updateRunProgress` (line ~354). After the `processedComments` block add:

```typescript
  if (state.totalAttachments !== undefined) add('total_attachments', state.totalAttachments);
  if (state.processedAttachments !== undefined) add('processed_attachments', state.processedAttachments);
```

- [ ] **Step 4: Run existing tests to verify nothing broken**

```bash
cd services/api
npm test -- --passWithNoTests 2>&1 | tail -5
```

Expected: `Tests: N passed, N total`

- [ ] **Step 5: Commit**

```bash
git add services/worker/src/migration/jira-migration.processor.ts
git commit -m "feat: add totalAttachments/processedAttachments to RunState and DB sync"
```

---

## Task 4: `adfToText()` Enhancement + Unit Tests

**Files:**
- Modify: `services/worker/src/migration/jira-migration.processor.ts` (lines 1967–1989)
- Create: `services/worker/src/migration/adf.spec.ts`

The current `adfToText()` silently drops `mediaSingle`, `media`, `image`, `emoji`, `mention`, and `inlineCard` nodes. We add an optional `attachmentMap` parameter (Map<jiraAttachmentId → filename>) so issue descriptions emit proper filenames; callers without a map get a generic placeholder.

- [ ] **Step 1: Write the failing unit tests**

Create `services/worker/src/migration/adf.spec.ts`:

```typescript
// services/worker/src/migration/adf.spec.ts
// Unit tests for adfToText — importable after we extract it to a helper module.
// For now we test the function in isolation by copy-importing its logic.

// NOTE: This file tests the EXPECTED behaviour after the fix.
// Run BEFORE the fix to confirm failures, then run again after.

import { adfToText } from './adf-helpers';

describe('adfToText', () => {
  it('renders plain paragraph', () => {
    const node = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    };
    expect(adfToText(node)).toBe('Hello\n');
  });

  it('renders mediaSingle with known attachment filename', () => {
    const map = new Map([['abc-123', 'screenshot.png']]);
    const node = {
      type: 'mediaSingle',
      content: [{
        type: 'media',
        attrs: { id: 'abc-123', type: 'file' },
      }],
    };
    expect(adfToText(node, map)).toContain('[📎 image: screenshot.png]');
  });

  it('renders mediaSingle with unknown attachment id using fallback', () => {
    const node = {
      type: 'mediaSingle',
      content: [{ type: 'media', attrs: { id: 'unknown-id', type: 'file' } }],
    };
    expect(adfToText(node)).toContain('[📎 image: attachment]');
  });

  it('renders external media inline as link reference', () => {
    const node = {
      type: 'media',
      attrs: { type: 'external', url: 'https://example.com/img.png' },
    };
    expect(adfToText(node)).toContain('[🔗 image: https://example.com/img.png]');
  });

  it('renders legacy image node', () => {
    const node = { type: 'image', attrs: { src: 'https://jira.example.com/secure/attachment/1/x.png' } };
    expect(adfToText(node)).toContain('[📎 image: https://jira.example.com/secure/attachment/1/x.png]');
  });

  it('renders emoji shortname', () => {
    const node = { type: 'emoji', attrs: { text: '😀', shortName: ':grinning:' } };
    expect(adfToText(node)).toBe('😀');
  });

  it('renders mention as @name', () => {
    const node = { type: 'mention', attrs: { text: 'alice', id: 'u1' } };
    expect(adfToText(node)).toBe('@alice');
  });

  it('renders inlineCard URL', () => {
    const node = { type: 'inlineCard', attrs: { url: 'https://jira.example.com/browse/PROJ-1' } };
    expect(adfToText(node)).toBe('https://jira.example.com/browse/PROJ-1');
  });

  it('handles null/undefined node gracefully', () => {
    expect(adfToText(null)).toBe('');
    expect(adfToText(undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Create the `adf-helpers.ts` extract**

The current `adfToText` lives inline in `jira-migration.processor.ts`. Extract it to a separate file so it can be imported by tests without pulling in all of the worker's dependencies:

Create `services/worker/src/migration/adf-helpers.ts`:

```typescript
// services/worker/src/migration/adf-helpers.ts
// Pure ADF-to-text converter — no dependencies, fully testable in isolation.

/**
 * Convert an Atlassian Document Format (ADF) node to plain text.
 *
 * @param node          ADF node (any shape — gracefully handles unknown types)
 * @param attachmentMap Optional map of Jira media ID → filename for labelling
 *                      inline images. If omitted, falls back to "attachment".
 */
export function adfToText(node: any, attachmentMap?: Map<string, string>): string {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';

  // Leaf nodes with no content array
  switch (node.type) {
    case 'hardBreak':
      return '\n';
    case 'emoji':
      return node.attrs?.text ?? '';
    case 'mention':
      return `@${node.attrs?.text ?? 'user'}`;
    case 'inlineCard':
      return node.attrs?.url ?? '';
    case 'image':
      // Legacy Jira Server inline image node
      return `[📎 image: ${node.attrs?.src ?? 'image'}]\n`;
    case 'media': {
      if (node.attrs?.type === 'external') {
        return `[🔗 image: ${node.attrs.url ?? 'external image'}]\n`;
      }
      const filename = attachmentMap?.get(String(node.attrs?.id ?? '')) ?? 'attachment';
      return `[📎 image: ${filename}]\n`;
    }
  }

  if (!Array.isArray(node.content)) return '';
  const parts = node.content.map((c: any) => adfToText(c, attachmentMap));

  switch (node.type) {
    case 'doc':
      return parts.join('');
    case 'paragraph':
      return parts.join('') + '\n';
    case 'mediaSingle':
      // Wrapper around a single media node — just render children + spacing
      return parts.join('') + '\n';
    case 'bulletList':
    case 'orderedList':
      return parts.join('');
    case 'listItem':
      return '- ' + parts.join('').trim() + '\n';
    case 'codeBlock':
      return '```\n' + parts.join('') + '```\n';
    case 'blockquote':
      return parts.map((p) => '> ' + p).join('');
    case 'heading': {
      const level = node.attrs?.level ?? 1;
      return '#'.repeat(level) + ' ' + parts.join('') + '\n';
    }
    case 'rule':
      return '---\n';
    default:
      return parts.join('');
  }
}
```

- [ ] **Step 3: Add Jest config to the worker if missing**

Check if `services/worker/package.json` has a `test` script. If not, add:

```json
"jest": {
  "preset": "ts-jest",
  "testEnvironment": "node",
  "testMatch": ["**/*.spec.ts"]
},
"devDependencies": {
  ...existing...,
  "@types/jest": "^29.5.0",
  "jest": "^29.7.0",
  "ts-jest": "^29.1.0"
}
```

And add to scripts:
```json
"test": "jest --passWithNoTests"
```

Then run `npm install` in `services/worker`.

- [ ] **Step 4: Run the tests — verify they FAIL (expected at this point)**

```bash
cd services/worker
npm test -- adf.spec
```

Expected: `Cannot find module './adf-helpers'` or similar — confirming the tests exist but the module doesn't yet.

- [ ] **Step 5: Update `extractDescription` and `adfToText` call sites in the processor to use the extracted helper**

In `jira-migration.processor.ts`, at the top add the import:

```typescript
import { adfToText } from './adf-helpers';
```

Remove the existing `adfToText` function body (lines ~1976–1989) — it's now imported from `adf-helpers.ts`.

Update `extractDescription` (line ~1967) to accept and forward the optional attachment map:

```typescript
function extractDescription(description: any, attachmentMap?: Map<string, string>): string | null {
  if (!description) return null;
  if (typeof description === 'string') return description;
  if (description.type === 'doc' && Array.isArray(description.content)) {
    return adfToText(description, attachmentMap).trim() || null;
  }
  return null;
}
```

- [ ] **Step 6: Run tests — verify they PASS**

```bash
cd services/worker
npm test -- adf.spec
```

Expected: `Tests: 9 passed, 9 total`

- [ ] **Step 7: Run API tests to confirm nothing is broken**

```bash
cd services/api
npm test -- --passWithNoTests 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add services/worker/src/migration/adf-helpers.ts \
        services/worker/src/migration/adf.spec.ts \
        services/worker/src/migration/jira-migration.processor.ts \
        services/worker/package.json \
        services/worker/package-lock.json
git commit -m "feat: extract adfToText to adf-helpers, add media/image/emoji/mention node support"
```

---

## Task 5: Phase 4 — Add Attachment Field + Stage Metadata

**Files:**
- Modify: `services/worker/src/migration/jira-migration.processor.ts` (lines ~1162, ~1293–1470)

Context: Phase 4's main loop is in `runIssuesPhase()`. For each page of issues, it builds `issueRowsToInsert` and calls a bulk CTE upsert. We add two things after that upsert: build a per-issue attachment map, and bulk-insert attachment metadata into the staging table.

- [ ] **Step 1: Add `JiraApiAttachment` type near the top of the file (after `JiraCredentials` interface)**

In `jira-migration.processor.ts`, after line 62 (`interface JiraCredentials`), add:

```typescript
interface JiraApiAttachment {
  id: string;
  filename: string;
  content: string;    // Direct authenticated download URL
  mimeType: string;
  size: number;
  author?: { accountId?: string; emailAddress?: string };
  created?: string;
}
```

- [ ] **Step 2: Add `attachment` to the FIELDS constant**

Find `FIELDS` (line ~1162):

```typescript
  const FIELDS = [
    'summary', 'description', 'issuetype', 'priority', 'status',
    'assignee', 'reporter', 'created', 'updated', 'duedate', 'labels',
    'customfield_10016', 'customfield_10020', 'timetracking',
    'subtasks', 'parent', 'issuelinks', 'comment',
    'attachment',   // ← add this line
  ].join(',');
```

- [ ] **Step 3: Build attachment map per issue, pass to `extractDescription`**

In the per-issue loop inside Phase 4 (around line ~1306, inside `for (const issue of page.issues ?? [])`), find where `description` is extracted:

```typescript
// BEFORE (find this line):
const description = extractDescription(fields.description);

// AFTER (replace with):
const attachmentMap = new Map<string, string>();
for (const att of (fields.attachment ?? []) as JiraApiAttachment[]) {
  attachmentMap.set(att.id, att.filename);
}
const description = extractDescription(fields.description, attachmentMap);
```

- [ ] **Step 4: Bulk-insert attachment staging rows after the issue upsert**

Find the section after the CTE issue upsert (around line ~1460, after `RETURNING id, jira_key` and the loop that populates `state.jiraIssueKeyToLocalId`).

Add this block immediately after that key-mapping loop:

```typescript
      // ── Stage attachment metadata for Phase 6 ───────────────────────────────
      if (state.options?.importAttachments) {
        const stagingRows: unknown[][] = [];
        for (const issue of page.issues ?? []) {
          const localId = state.jiraIssueKeyToLocalId[issue.key];
          if (!localId) continue;
          for (const att of (issue.fields?.attachment ?? []) as JiraApiAttachment[]) {
            stagingRows.push([
              state.id,          // migration_run_id
              att.id,            // jira_attachment_id
              issue.key,         // jira_issue_key
              localId,           // local_issue_id
              att.content,       // download_url
              att.filename,      // file_name
              att.mimeType,      // mime_type
              att.size,          // file_size
            ]);
          }
        }

        if (stagingRows.length > 0) {
          const stagingPlaceholders = stagingRows
            .map((_, i) => {
              const b = i * 8 + 1;
              return `($${b},$${b+1},$${b+2},$${b+3}::uuid,$${b+4},$${b+5},$${b+6},$${b+7}::bigint)`;
            })
            .join(', ');
          await client.query(
            `INSERT INTO jira_migration_attachment_staging
               (migration_run_id, jira_attachment_id, jira_issue_key, local_issue_id,
                download_url, file_name, mime_type, file_size)
             VALUES ${stagingPlaceholders}
             ON CONFLICT (migration_run_id, jira_attachment_id) DO NOTHING`,
            stagingRows.flat(),
          ).catch((err: any) => {
            addError(state, `attachment staging insert: ${err.message}`);
          });
        }
      }
```

- [ ] **Step 5: Run API tests**

```bash
cd services/api
npm test -- --passWithNoTests 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 6: Run worker tests**

```bash
cd services/worker
npm test -- --passWithNoTests 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add services/worker/src/migration/jira-migration.processor.ts
git commit -m "feat: capture Jira attachment metadata into staging table during Phase 4"
```

---

## Task 6: Phase 6 — Full Download Pipeline Implementation

**Files:**
- Modify: `services/worker/src/migration/jira-migration.processor.ts` (lines ~1–29 imports, ~1925–1944 Phase 6 stub)

This is the largest task. It replaces the Phase 6 stub with a full implementation and adds three helper functions above it.

- [ ] **Step 1: Add `@aws-sdk/client-s3` import at the top of the processor**

At the top of `jira-migration.processor.ts`, after the existing imports (around line 29), add:

```typescript
import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
```

Note: `randomUUID` replaces the inline `uuidv4()` pattern — it's built into Node 15+.

- [ ] **Step 2: Add MinIO helper constants and functions above the Phase 6 function**

Find the comment `// ─── Phase 6: Attachments` (line ~1923). Insert the following block immediately before it:

```typescript
// ─── MinIO / S3 helpers ───────────────────────────────────────────────────────

const MINIO_BUCKET = process.env.MINIO_BUCKET ?? 'boardupscale';
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50 MB hard limit
const ATTACHMENT_BATCH_SIZE = 20;

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

async function ensureMinIOBucket(s3: S3Client, bucket: string): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

function sanitizeStorageKey(runId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  return `jira/${runId}/${randomUUID()}-${safe}`;
}

/**
 * Download a binary file from a URL with auth, redirect-following, size limit,
 * and exponential backoff on 429.
 *
 * Security note: auth header is stripped when following redirects to a different
 * hostname — prevents credential leakage to third-party CDNs.
 */
async function downloadAttachmentBinary(
  url: string,
  authHeader: string,
  maxBytes: number,
  _attempt = 1,
  _originalHost = '',
): Promise<Buffer> {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const transport = isHttps ? https : http;
  const originalHost = _originalHost || parsed.hostname;

  return new Promise<Buffer>((resolve, reject) => {
    const headers: Record<string, string> = {
      Accept: '*/*',
    };
    // Only send auth to the same origin — not to third-party CDN redirects
    if (parsed.hostname === originalHost && authHeader) {
      headers['Authorization'] = authHeader;
    }

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
    };

    const req = transport.request(options, (res) => {
      // Handle redirects (up to 5 hops)
      const status = res.statusCode ?? 0;
      if (status === 301 || status === 302 || status === 307 || status === 308) {
        res.resume();
        if (_attempt > 5) { reject(new Error('Too many redirects')); return; }
        const location = res.headers['location'];
        if (!location) { reject(new Error('Redirect with no Location header')); return; }
        const nextUrl = new URL(location, url).toString();
        downloadAttachmentBinary(nextUrl, authHeader, maxBytes, _attempt + 1, originalHost)
          .then(resolve).catch(reject);
        return;
      }

      // Rate limited — exponential backoff and retry
      if (status === 429 && _attempt <= 4) {
        res.resume();
        const backoff = Math.pow(2, _attempt - 1) * 500; // 500ms, 1s, 2s, 4s
        setTimeout(() => {
          downloadAttachmentBinary(url, authHeader, maxBytes, _attempt + 1, originalHost)
            .then(resolve).catch(reject);
        }, backoff);
        return;
      }

      if (status >= 400) {
        res.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }

      const chunks: Buffer[] = [];
      let received = 0;

      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > maxBytes) {
          req.destroy();
          reject(new Error(`Response exceeded ${Math.round(maxBytes / 1024 / 1024)}MB limit`));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });

    req.on('error', (err) => {
      // Network error — retry up to 3 times with 1s gap
      if (_attempt <= 3) {
        setTimeout(() => {
          downloadAttachmentBinary(url, authHeader, maxBytes, _attempt + 1, originalHost)
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

- [ ] **Step 3: Replace the Phase 6 stub with the full implementation**

Find `runAttachmentsPhase` (line ~1925). Replace the entire function with:

```typescript
async function runAttachmentsPhase(
  client: PoolClient,
  state: RunState,
  io: IORedis | null,
): Promise<void> {
  console.log(`[Migration:${state.id}] Phase 6 — attachments`);

  if (!state.options?.importAttachments) {
    await updateRunProgress(client, state.id, { completedPhase: PHASE_ATTACHMENTS }, io);
    console.log(`[Migration:${state.id}] Attachments disabled — skipping`);
    return;
  }

  // Verify MinIO is reachable before entering the loop (fail fast, phase is resumable)
  let s3: S3Client;
  try {
    s3 = initMinIOClient();
    await ensureMinIOBucket(s3, MINIO_BUCKET);
  } catch (err: any) {
    addError(state, `Phase 6: MinIO unavailable — ${err.message}`);
    await updateRunProgress(client, state.id, { errorLog: state.errorLog }, io);
    throw err; // re-throw so runPhaseWithRetry can retry the phase
  }

  // Total pending count for progress UI
  const { rows: [countRow] } = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM jira_migration_attachment_staging
     WHERE migration_run_id = $1 AND downloaded_at IS NULL`,
    [state.id],
  );
  state.totalAttachments = parseInt(countRow.count, 10);
  state.processedAttachments = 0;
  await updateRunProgress(client, state.id, {
    totalAttachments: state.totalAttachments,
    processedAttachments: 0,
    currentPhase: PHASE_ATTACHMENTS,
  }, io);

  // Build Jira auth header (same pattern as jiraGet)
  const credentials = await loadCredentials(client, state.connectionId, state.organizationId);
  const authHeader = credentials.email
    ? `Basic ${Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64')}`
    : `Bearer ${credentials.apiToken}`;

  console.log(
    `[Migration:${state.id}] Phase 6 — ${state.totalAttachments} attachments to download`,
  );

  // ── Batch loop ───────────────────────────────────────────────────────────────
  while (true) {
    const { rows: batch } = await client.query<{
      id: string;
      jira_attachment_id: string;
      local_issue_id: string;
      download_url: string;
      file_name: string;
      mime_type: string;
      file_size: string;
    }>(
      `SELECT id, jira_attachment_id, local_issue_id, download_url,
              file_name, mime_type, file_size
       FROM jira_migration_attachment_staging
       WHERE migration_run_id = $1
         AND downloaded_at IS NULL
         AND attempt_count < 3
       ORDER BY jira_issue_key, file_name
       LIMIT $2`,
      [state.id, ATTACHMENT_BATCH_SIZE],
    );

    if (batch.length === 0) break;

    for (const row of batch) {
      // Increment attempt count first — a crash mid-download still counts
      await client.query(
        `UPDATE jira_migration_attachment_staging
         SET attempt_count = attempt_count + 1
         WHERE id = $1`,
        [row.id],
      );

      const fileSize = parseInt(row.file_size, 10);

      // Skip oversized files
      if (fileSize > MAX_ATTACHMENT_BYTES) {
        const msg = `Attachment "${row.file_name}" skipped — ${Math.round(fileSize / 1024 / 1024)}MB exceeds ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB limit`;
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
        buffer = await downloadAttachmentBinary(row.download_url, authHeader, MAX_ATTACHMENT_BYTES);
      } catch (err: any) {
        const msg = `Download failed "${row.file_name}": ${err.message}`;
        addError(state, msg);
        await client.query(
          `UPDATE jira_migration_attachment_staging SET error = $1 WHERE id = $2`,
          [msg, row.id],
        );
        continue;
      }

      // Upload to MinIO
      const storageKey = sanitizeStorageKey(state.id, row.file_name);
      try {
        await s3.send(new PutObjectCommand({
          Bucket: MINIO_BUCKET,
          Key: storageKey,
          Body: buffer,
          ContentType: row.mime_type,
          ContentLength: buffer.length,
        }));
      } catch (err: any) {
        const msg = `MinIO upload failed "${row.file_name}": ${err.message}`;
        addError(state, msg);
        await client.query(
          `UPDATE jira_migration_attachment_staging SET error = $1 WHERE id = $2`,
          [msg, row.id],
        );
        continue;
      }

      // Insert attachment record (ON CONFLICT DO NOTHING = last-resort dedup by jira_attachment_id)
      await client.query(
        `INSERT INTO attachments
           (id, issue_id, uploaded_by, file_name, file_size, mime_type,
            storage_key, storage_bucket, jira_attachment_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (jira_attachment_id) WHERE jira_attachment_id IS NOT NULL DO NOTHING`,
        [
          randomUUID(),
          row.local_issue_id,
          state.triggeredById,
          row.file_name,
          buffer.length,
          row.mime_type,
          storageKey,
          MINIO_BUCKET,
          row.jira_attachment_id,
        ],
      ).catch((err: any) => addError(state, `attachments insert "${row.file_name}": ${err.message}`));

      // Mark staging row complete
      await client.query(
        `UPDATE jira_migration_attachment_staging SET downloaded_at = NOW() WHERE id = $1`,
        [row.id],
      );

      state.processedAttachments++;
      await updateRunProgress(client, state.id, {
        processedAttachments: state.processedAttachments,
        errorLog: state.errorLog,
      }, io);

      // Courtesy delay between downloads (same pattern as REQUEST_DELAY_MS in other phases)
      await delay(REQUEST_DELAY_MS);
    }
  }

  const failed = state.totalAttachments - state.processedAttachments;
  console.log(
    `[Migration:${state.id}] Phase 6 done — ${state.processedAttachments} downloaded, ${failed} failed/skipped`,
  );

  await updateRunProgress(client, state.id, {
    completedPhase: PHASE_ATTACHMENTS,
    errorLog: state.errorLog,
  }, io);
}
```

- [ ] **Step 4: Add a unique constraint on `jira_attachment_id` in the migration (needed for ON CONFLICT)**

Open `services/api/src/database/migrations/1744400000000-AddAttachmentStaging.ts`.

Replace the index on `jira_attachment_id` with a partial unique constraint (or just use the index — ON CONFLICT with `WHERE` clause works without a full unique constraint in newer PG, but to be safe, add it):

The `ON CONFLICT (jira_attachment_id) WHERE jira_attachment_id IS NOT NULL` syntax requires a partial unique index. Add to the migration's `up()`:

```typescript
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uidx_attachments_jira_id"
        ON "attachments" ("jira_attachment_id")
        WHERE "jira_attachment_id" IS NOT NULL
    `);
```

And in `down()`:
```typescript
    await queryRunner.query(`DROP INDEX IF EXISTS "uidx_attachments_jira_id"`);
```

Remove the earlier non-unique index line `idx_attachments_jira_id` (replace with this unique one).

- [ ] **Step 5: Re-run the migration**

```bash
cd services/api
npm run migration:revert   # revert the last migration
npm run migration:run      # re-apply with the unique index
```

- [ ] **Step 6: Run all tests**

```bash
cd services/api && npm test -- --passWithNoTests 2>&1 | tail -8
cd services/worker && npm test -- --passWithNoTests 2>&1 | tail -8
```

Expected: all passing, no failures.

- [ ] **Step 7: Commit**

```bash
git add services/worker/src/migration/jira-migration.processor.ts \
        services/api/src/database/migrations/1744400000000-AddAttachmentStaging.ts
git commit -m "feat: implement Phase 6 attachment download pipeline with MinIO upload and resumability"
```

---

## Task 7: Wire Attachment Progress into `loadRun`

This small task ensures `total_attachments` and `processed_attachments` are correctly restored on resume.

**Files:**
- Modify: `services/worker/src/migration/jira-migration.processor.ts` (lines ~190–230)

- [ ] **Step 1: Add columns to `loadRun` SELECT**

In `loadRun`, the SELECT list ends with:
```
total_comments AS "totalComments",
processed_comments AS "processedComments",
```

Add immediately after:
```typescript
            total_attachments AS "totalAttachments",
            processed_attachments AS "processedAttachments",
```

(This was added to `updateRunProgress` in Task 3 but `loadRun` also needs to read them back for resume scenarios.)

- [ ] **Step 2: Run tests**

```bash
cd services/api && npm test -- --passWithNoTests 2>&1 | tail -5
cd services/worker && npm test -- --passWithNoTests 2>&1 | tail -5
```

Expected: all passing.

- [ ] **Step 3: Commit**

```bash
git add services/worker/src/migration/jira-migration.processor.ts
git commit -m "fix: restore totalAttachments/processedAttachments on resume in loadRun"
```

---

## Task 8: End-to-End Smoke Test

No new test files — verify the full pipeline compiles and the test suite passes cleanly.

- [ ] **Step 1: Build the worker TypeScript to catch any type errors**

```bash
cd services/worker
npm run build 2>&1 | head -30
```

Expected: `Found 0 errors.` (or the equivalent tsc output with no errors)

- [ ] **Step 2: Build the API TypeScript**

```bash
cd services/api
npm run build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Run full test suites**

```bash
cd services/api && npm test -- --passWithNoTests 2>&1 | tail -8
cd services/worker && npm test -- --passWithNoTests 2>&1 | tail -8
```

Expected: all passing.

- [ ] **Step 4: Final commit (if any lint/type fixes were needed)**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors from Jira media migration implementation"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `jira_migration_attachment_staging` table → Task 1
- ✅ `jira_attachment_id` column on `attachments` → Task 1
- ✅ `total_attachments`/`processed_attachments` counters → Tasks 1, 3, 7
- ✅ `@aws-sdk/client-s3` dependency → Task 2
- ✅ `adfToText` media/image/emoji/mention/inlineCard support → Task 4
- ✅ `attachment` added to Phase 4 FIELDS → Task 5
- ✅ Phase 4 staging insert (idempotent, batched) → Task 5
- ✅ `downloadAttachmentBinary` (redirects, auth strip, 429 backoff, size limit, retry) → Task 6
- ✅ `initMinIOClient`, `ensureMinIOBucket`, `sanitizeStorageKey` → Task 6
- ✅ Phase 6 full implementation (batch loop, skip oversized, per-item error, resumable) → Task 6
- ✅ `loadRun` reads attachment counters for resume → Task 7
- ✅ All edge cases from spec (size limit, rate limit, redirect, CDN auth strip, dedup, zero attachments, importAttachments=false) → covered in Task 6 implementation
