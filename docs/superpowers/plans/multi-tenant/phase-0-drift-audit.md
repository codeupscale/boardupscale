# Phase 0 — Drift Audit Observability

**Goal:** Build the observability layer we need for the entire transition. Every subsequent phase leans on the drift audit to know if something went sideways.

**Duration:** 1 day
**Deploys:** 1
**Prerequisites:** Hotfixes from Apr 21–22 already shipped (commits `a702d50` through `b3afd09` + `fd91170`, `9b1bd84`).
**Rollback:** Not applicable — pure additive code. Worst case: disable the cron.

---

## What ships in this phase

1. `AuditService.checkMultiTenantDrift()` — a read-only service that runs every invariant query from `README.md` and returns structured results.
2. `GET /admin/audit/multi-tenant-drift` — admin-only endpoint returning the latest audit result.
3. BullMQ repeatable job running the audit hourly, logging results and alerting on non-zero drift.
4. PostHog event + Slack webhook on drift > 0.

---

## Pre-flight checklist

- [ ] Confirm production is on commit `b3afd09` or later (all hotfixes applied)
- [ ] Confirm BullMQ worker is running (`docker ps | grep bu-worker`)
- [ ] Confirm Redis is healthy (drift job uses Redis for deduplication)
- [ ] SLACK_DRIFT_WEBHOOK_URL configured in `/home/ubuntu/infra/.env` (or skip Slack alerts — logs are enough)

---

## Files to create

### API

**`services/api/src/modules/audit/multi-tenant-drift.service.ts`** (new file)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface DriftReport {
  ranAt: string;
  totalDrift: number;
  checks: Array<{
    name: string;
    expectedZero: boolean;
    actual: number;
    passed: boolean;
    sampleRows?: unknown[];
  }>;
}

@Injectable()
export class MultiTenantDriftService {
  private readonly logger = new Logger(MultiTenantDriftService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async check(): Promise<DriftReport> {
    const checks: DriftReport['checks'] = [];

    const run = async (name: string, sql: string, sampleSql?: string) => {
      const { count } = await this.ds.query(sql).then((r) => r[0] ?? { count: 0 });
      const actual = Number(count);
      const passed = actual === 0;
      const check = { name, expectedZero: true, actual, passed } as DriftReport['checks'][number];
      if (!passed && sampleSql) {
        check.sampleRows = await this.ds.query(sampleSql);
      }
      checks.push(check);
    };

    // Invariant B: orphaned FKs
    await run(
      'orphan.issues.reporter',
      `SELECT COUNT(*)::int AS count FROM issues i LEFT JOIN users u ON u.id = i.reporter_id WHERE u.id IS NULL`,
    );
    await run(
      'orphan.issues.assignee',
      `SELECT COUNT(*)::int AS count FROM issues i LEFT JOIN users u ON u.id = i.assignee_id WHERE i.assignee_id IS NOT NULL AND u.id IS NULL`,
    );
    await run(
      'orphan.comments.author',
      `SELECT COUNT(*)::int AS count FROM comments c LEFT JOIN users u ON u.id = c.author_id WHERE u.id IS NULL`,
    );
    await run(
      'orphan.attachments.uploaded_by',
      `SELECT COUNT(*)::int AS count FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE u.id IS NULL`,
    );
    await run(
      'orphan.org_members.user',
      `SELECT COUNT(*)::int AS count FROM organization_members m LEFT JOIN users u ON u.id = m.user_id WHERE u.id IS NULL`,
    );
    await run(
      'orphan.org_members.org',
      `SELECT COUNT(*)::int AS count FROM organization_members m LEFT JOIN organizations o ON o.id = m.organization_id WHERE o.id IS NULL`,
    );

    // Invariant E: exactly one default membership per user
    await run(
      'default.membership.multiple_per_user',
      `SELECT COUNT(*)::int AS count FROM (
         SELECT user_id FROM organization_members WHERE is_default = true
         GROUP BY user_id HAVING COUNT(*) > 1
       ) x`,
      `SELECT user_id, COUNT(*) FROM organization_members WHERE is_default = true
         GROUP BY user_id HAVING COUNT(*) > 1 LIMIT 20`,
    );

    // Phase 2+ invariants — will return 0 until then, skipped here:
    //   Invariant C (role/is_active parity) — requires org_members.is_active column (Phase 1)
    //   Invariant D (invitations drift) — requires invitations table (Phase 1)

    const totalDrift = checks.filter((c) => !c.passed).reduce((sum, c) => sum + c.actual, 0);
    const report: DriftReport = { ranAt: new Date().toISOString(), totalDrift, checks };

    if (totalDrift > 0) {
      this.logger.error(`[MT-Drift] ${totalDrift} drift rows detected`, JSON.stringify(checks));
    } else {
      this.logger.log('[MT-Drift] All invariants clean');
    }

    return report;
  }
}
```

**`services/api/src/modules/audit/audit.controller.ts`** (new file)

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { MultiTenantDriftService } from './multi-tenant-drift.service';

@ApiTags('admin-audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/audit')
export class AuditController {
  constructor(private drift: MultiTenantDriftService) {}

  @Get('multi-tenant-drift')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Run the multi-tenant invariant audit on demand' })
  async runDrift() {
    return this.drift.check();
  }
}
```

**`services/api/src/modules/audit/audit.module.ts`** (new file)

```typescript
import { Module } from '@nestjs/common';
import { MultiTenantDriftService } from './multi-tenant-drift.service';
import { AuditController } from './audit.controller';

@Module({
  controllers: [AuditController],
  providers: [MultiTenantDriftService],
  exports: [MultiTenantDriftService],
})
export class AuditModule {}
```

**`services/api/src/app.module.ts`** — import `AuditModule`.

### Worker

**`services/worker/src/drift-audit/drift-audit.processor.ts`** (new file) — BullMQ job that calls the same SQL queries as the API service. Do NOT import the Nest service; the worker is plain Node. Duplicate the query list; keep them in sync via a shared constants file in Phase 2.

```typescript
import { Worker, Queue, JobsOptions } from 'bullmq';
import { Pool } from 'pg';
import { createRedisConnection } from '../redis';
import { config } from '../config';

const QUEUE_NAME = 'drift-audit';
const REPEAT_EVERY_MS = 60 * 60 * 1000; // 1 hour

const CHECKS: Array<{ name: string; sql: string }> = [
  { name: 'orphan.issues.reporter',          sql: `SELECT COUNT(*)::int AS c FROM issues i LEFT JOIN users u ON u.id = i.reporter_id WHERE u.id IS NULL` },
  { name: 'orphan.issues.assignee',          sql: `SELECT COUNT(*)::int AS c FROM issues i LEFT JOIN users u ON u.id = i.assignee_id WHERE i.assignee_id IS NOT NULL AND u.id IS NULL` },
  { name: 'orphan.comments.author',          sql: `SELECT COUNT(*)::int AS c FROM comments c LEFT JOIN users u ON u.id = c.author_id WHERE u.id IS NULL` },
  { name: 'orphan.attachments.uploaded_by',  sql: `SELECT COUNT(*)::int AS c FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE u.id IS NULL` },
  { name: 'orphan.org_members.user',         sql: `SELECT COUNT(*)::int AS c FROM organization_members m LEFT JOIN users u ON u.id = m.user_id WHERE u.id IS NULL` },
  { name: 'orphan.org_members.org',          sql: `SELECT COUNT(*)::int AS c FROM organization_members m LEFT JOIN organizations o ON o.id = m.organization_id WHERE o.id IS NULL` },
  { name: 'default.membership.multiple',     sql: `SELECT COUNT(*)::int AS c FROM (SELECT user_id FROM organization_members WHERE is_default=true GROUP BY user_id HAVING COUNT(*)>1) x` },
];

export function startDriftAuditWorker(db: Pool): Worker {
  const connection = createRedisConnection();
  const queue = new Queue(QUEUE_NAME, { connection });

  // Schedule the repeatable job (idempotent upsert).
  void queue.add(
    'run',
    {},
    {
      jobId: 'drift-audit-hourly',
      repeat: { every: REPEAT_EVERY_MS, immediately: true },
      removeOnComplete: 24,
      removeOnFail: 24,
    } satisfies JobsOptions,
  );

  return new Worker(
    QUEUE_NAME,
    async () => {
      const results: Array<{ name: string; count: number }> = [];
      for (const c of CHECKS) {
        const { rows } = await db.query<{ c: number }>(c.sql);
        results.push({ name: c.name, count: Number(rows[0]?.c ?? 0) });
      }
      const totalDrift = results.reduce((s, r) => s + r.count, 0);
      console.log(`[drift-audit] totalDrift=${totalDrift}`, JSON.stringify(results));

      if (totalDrift > 0 && config.slackDriftWebhookUrl) {
        await notifySlack(config.slackDriftWebhookUrl, totalDrift, results);
      }
      return { totalDrift, results };
    },
    { connection, concurrency: 1 },
  );
}

async function notifySlack(
  url: string,
  total: number,
  rows: Array<{ name: string; count: number }>,
): Promise<void> {
  const failed = rows.filter((r) => r.count > 0);
  const body = {
    text: `:rotating_light: Multi-tenant drift detected — ${total} offending rows`,
    attachments: [
      {
        color: 'danger',
        fields: failed.map((f) => ({ title: f.name, value: String(f.count), short: true })),
      },
    ],
  };
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
```

**`services/worker/src/main.ts`** — add `startDriftAuditWorker(db)` alongside existing workers.

**`services/worker/src/config.ts`** — add `slackDriftWebhookUrl: process.env.SLACK_DRIFT_WEBHOOK_URL || ''`.

---

## Tests to add

### API

**`services/api/src/modules/audit/multi-tenant-drift.service.spec.ts`**

- `returns totalDrift=0 on a clean DB`
- `detects orphaned issue.reporter_id`
- `detects a user with two default memberships`
- `returns structured sample rows for failing checks`

Use the existing integration-test pattern (docker-compose postgres, migrations, seed a single org + user).

### Worker

**`services/worker/src/drift-audit/drift-audit.processor.spec.ts`**

- `processor runs all CHECKS and returns totalDrift`
- `does not call Slack when totalDrift=0`
- `calls Slack once when totalDrift>0`

Mock `fetch` globally with jest.

---

## Audit queries to run before and after deploy

Before (record baseline in runbook):

```sql
SELECT 'users' t, COUNT(*) FROM users
UNION ALL SELECT 'org_members', COUNT(*) FROM organization_members
UNION ALL SELECT 'invitations_table_exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='invitations') THEN 1 ELSE 0 END;
```

After (must match except for `invitations_table_exists` which is still 0 — not in this phase):

Same query. Counts unchanged.

---

## Completion criteria

- [ ] `GET /admin/audit/multi-tenant-drift` returns `{ totalDrift: 0 }` in production
- [ ] BullMQ job `drift-audit-hourly` appears in the queue list
- [ ] Worker logs show `[drift-audit] totalDrift=0` hourly
- [ ] Unit tests green
- [ ] No API error-rate regression (<0.1%)
- [ ] Staging soak ≥ 24h

---

## Rollback

Not required. Worst case, disable the repeatable job:

```bash
# SSH to prod, then in the worker container:
docker exec -it infra-bu-worker-1 sh -c 'node -e "
  const { Queue } = require(\"bullmq\");
  const q = new Queue(\"drift-audit\", { connection: { host: \"redis\", port: 6379 } });
  q.removeRepeatable(\"run\", { every: 3600000, immediately: true });
  q.close();
"'
```

The endpoint is read-only and harmless.

---

## Next

Once this is green in production, proceed to `phase-1-additive-schema.md`.
