# Phase 4 — Freeze Legacy Writes + Soak

**Goal:** stop writing the legacy columns. New-shape is authoritative. Old columns remain in the schema as a safety net for one week of soak; if anything regresses, re-enable dual-write instantly.

**Duration:** 3 days of engineering + 1 week soak
**Deploys:** 1 (+ flag flip)
**Prerequisites:** Phase 3 complete; every read flag on for ≥72h; drift audit 0 for ≥7 days.
**Rollback:** `DUAL_WRITE_LEGACY_SHAPE=true` → dual-write resumes; new writes repopulate old columns.

---

## What changes

1. Every dual-write branch from Phase 2 is gated behind `DUAL_WRITE_LEGACY_SHAPE` (already wired in Phase 2 config).
2. Default the flag to `false` in `.env` and `.env.example`.
3. Add a "legacy column access" logger that warns if any code path READS the legacy columns during the soak. Helps catch consumers we missed.

---

## Code changes

### Config

`services/api/src/config/configuration.ts`:

```typescript
dualWriteLegacyShape: process.env.DUAL_WRITE_LEGACY_SHAPE === 'true',  // default false from Phase 4
```

Worker config mirrors this.

### Legacy-read access logging

Add a thin middleware/interceptor that logs any DB query referencing the about-to-be-dropped columns. Pure observability — it doesn't block reads.

`services/api/src/common/interceptors/legacy-access.interceptor.ts`:

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';

const LEGACY_COLUMNS = [
  'users.organization_id',
  'users.role',
  'users.is_active',
  'users.invitation_status',
  'users.jira_account_id',
  'users.email_verification_token',
  'users.email_verification_expiry',
  'users.pending_invite_organization_id',
];

@Injectable()
export class LegacyAccessInterceptor implements NestInterceptor {
  private readonly logger = new Logger('LegacyAccess');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle();
  }
}
```

A more useful approach: hook TypeORM's logger. Add to `data-source.ts`:

```typescript
logging: ['query', 'error'],
logger: {
  logQuery(query, params) {
    if (process.env.LEGACY_ACCESS_LOG !== 'true') return;
    for (const col of LEGACY_COLUMNS) {
      if (query.includes(col)) {
        console.warn(`[legacy-access] ${col} referenced in query: ${query.slice(0, 200)}`);
        return;
      }
    }
  },
  logQueryError() {}, logQuerySlow() {}, logSchemaBuild() {}, logMigration() {}, log() {},
}
```

Enable `LEGACY_ACCESS_LOG=true` in prod during the soak; grep Grafana/CloudWatch for hits. Disable before Phase 5.

### Call sites

Every `if (this.flags.dualWriteLegacyShape) { /* write to users.X */ }` block — nothing needs to change except turning the flag off, because we wrote them behind a flag in Phase 2.

If you find any Phase-2 dual-write NOT behind the flag, wrap it now. Run `grep -rn "users.role =" services/api/src/` — every hit should already be inside a flag check.

### Jira migration worker

Same: the legacy `users.jira_account_id` write becomes flag-gated. With the flag off, only `organization_members.jira_account_id` gets written.

---

## Tests

- No new unit tests strictly required; the legacy-off paths are covered by existing Phase 2 tests with the flag toggled.
- **Integration smoke:** with `DUAL_WRITE_LEGACY_SHAPE=false`, run every scenario from the design doc §2 and assert:
  - `organization_members` always updated
  - `users` legacy columns unchanged (no writes)

One new test file:

`services/api/src/modules/organizations/organizations.service.legacy-frozen.spec.ts`

```typescript
it('invite new user does not write users.email_verification_token when flag is off', async () => {
  process.env.DUAL_WRITE_LEGACY_SHAPE = 'false';
  const userBefore = await userRepo.findOne({ where: { email: 'test@example.com' } });
  // ...invite flow...
  const userAfter = await userRepo.findOne({ where: { email: 'test@example.com' } });
  expect(userAfter?.emailVerificationToken).toBe(userBefore?.emailVerificationToken ?? null);
  // invitations table should have the new row
  const invite = await invitationsRepo.findOne({ where: { email: 'test@example.com' } });
  expect(invite?.status).toBe('pending');
});
```

Repeat for: role change, deactivate, revoke invite, Jira user upsert.

---

## Deployment procedure

1. Ship the code change that defaults `DUAL_WRITE_LEGACY_SHAPE=false`
2. Flip the production `.env`:
   ```bash
   ssh prod "sed -i 's/^DUAL_WRITE_LEGACY_SHAPE=.*/DUAL_WRITE_LEGACY_SHAPE=false/' /home/ubuntu/infra/.env"
   ssh prod "cd /home/ubuntu/infra && docker compose up -d bu-api bu-worker"
   ```
3. Enable legacy-access logging:
   ```bash
   ssh prod "sed -i 's/^LEGACY_ACCESS_LOG=.*/LEGACY_ACCESS_LOG=true/' /home/ubuntu/infra/.env"
   ssh prod "docker compose up -d bu-api"
   ```
4. Tail logs for 24h. Any `[legacy-access]` warnings surface consumers we missed. Fix them under the same flag structure before continuing.

---

## Audit during soak

Run hourly, alert on non-zero:

```sql
-- A. Legacy columns should not have received a value-update in the last hour.
--    (created_at / updated_at changes are OK; we check column-level via audit_logs.)
-- Skip direct checks; rely on the LEGACY_ACCESS_LOG output.

-- B. Every invite created in the last hour is in invitations table, not users table
SELECT COUNT(*) FROM invitations
 WHERE invited_at > NOW() - INTERVAL '1 hour' AND status = 'pending';
-- Compared against any users.email_verification_token updates in the same window (should be 0 via logs).

-- C. Every role change in the last hour is on organization_members
--    Check audit_logs for 'organization.member.role_changed' events; confirm membership.updated_at
--    changed but users.updated_at didn't (for the role field specifically).
```

The drift audit from Phase 2 should still return 0 — any non-zero value here means someone's writing the legacy shape but not the new one, which means a missed call site.

---

## Completion criteria

- [ ] `DUAL_WRITE_LEGACY_SHAPE=false` in prod for ≥1 week
- [ ] Zero `[legacy-access]` warnings in logs for the last 48h of the soak
- [ ] Drift audit: 0 for the full soak window
- [ ] No P1/P0 bugs reported
- [ ] Support inbox: zero tickets related to "can't log in", "wrong workspace", "invite failed"

---

## Rollback

```bash
ssh prod "sed -i 's/^DUAL_WRITE_LEGACY_SHAPE=.*/DUAL_WRITE_LEGACY_SHAPE=true/' /home/ubuntu/infra/.env"
ssh prod "docker compose up -d bu-api bu-worker"
```

Dual-write resumes instantly. Data catches up within seconds (Phase 2's writes were lossless — we never lost them, just stopped writing).

Then investigate the regression, hotfix, and re-attempt the freeze.

---

## Next

Phase 5 — drop legacy columns. Only proceed after the 1-week soak is clean.
