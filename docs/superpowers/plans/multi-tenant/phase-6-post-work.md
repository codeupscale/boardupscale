# Phase 6 — Post-Work

**Goal:** remove transitional scaffolding; ship the recurring jobs and docs that make the new architecture self-sustaining.

**Duration:** 1 week
**Deploys:** 2–3
**Prerequisites:** Phase 5 complete; 30-day stability window observed.
**Rollback:** N/A — all items are additive or removing dead code.

---

## Checklist

### 6.1 Expired-invitations cron (BullMQ)

**`services/worker/src/invitations/expire-invitations.processor.ts`** (new)

```typescript
import { Worker, Queue } from 'bullmq';
import { Pool } from 'pg';
import { createRedisConnection } from '../redis';

const QUEUE = 'invitations-expire';

export function startInvitationExpirerWorker(db: Pool): Worker {
  const connection = createRedisConnection();
  const q = new Queue(QUEUE, { connection });
  void q.add(
    'run',
    {},
    {
      jobId: 'invitations-expire-hourly',
      repeat: { every: 60 * 60 * 1000, immediately: true },  // hourly
      removeOnComplete: 24,
      removeOnFail: 24,
    },
  );

  return new Worker(
    QUEUE,
    async () => {
      const { rows } = await db.query<{ updated: number }>(
        `UPDATE invitations
            SET status = 'expired'
          WHERE status = 'pending' AND expires_at < NOW()
          RETURNING 1`,
      );
      const updated = rows.length;
      if (updated > 0) console.log(`[invitations-expire] marked ${updated} invitations expired`);
      return { updated };
    },
    { connection, concurrency: 1 },
  );
}
```

Wire into `services/worker/src/main.ts`.

Test: seed a pending invitation with `expires_at < NOW()`, run the worker, assert status is `expired`.

### 6.2 Remove transition flags

After 30 days of stability:

1. Remove all `config.flags.readFromNewShape.*` references — they're all `true` now, the legacy branches are dead code.
2. Remove `DUAL_WRITE_NEW_SHAPE` and `DUAL_WRITE_LEGACY_SHAPE` flags and their code branches.
3. Drop `LEGACY_ACCESS_LOG` and the TypeORM logger hook.
4. Document in `CLAUDE.md` that multi-tenant is now fully migrated — no transition-era references remain.

PR-per-consumer to keep the diffs reviewable.

### 6.3 Drift audit slimming

`MultiTenantDriftService` no longer needs Invariants C and D (role/invite drift between old and new shape — there's no old shape). Keep Invariants B (orphaned FKs) and E (single default membership). Rename the service to `IntegrityAuditService` for clarity.

Slack webhook remains — orphaned FKs or multiple defaults per user are still conditions worth alerting on.

### 6.4 Documentation

Update:

- **`CLAUDE.md`**:
  - Remove any reference to `users.role`, `users.organization_id`, etc.
  - Add a short "Multi-tenant model" section pointing at the design doc and summarizing: identity on `users`, membership on `organization_members`, invites on `invitations`.
- **API OpenAPI spec** — the `/users/me` and `/organizations/my-memberships` endpoints should already be accurate; regenerate the Swagger JSON.
- **`README.md`** (repo root) — add a one-paragraph summary of the tenancy model under "Architecture".
- **Runbook** (`docs/superpowers/runbooks/` if you keep one) — add a "How to debug a cross-org bug" page: queries to run, invariants that must hold, how to check drift.

### 6.5 Frontend cleanup

- Remove the workspace-picker fallback paths that handled the old single-org world.
- Audit `auth.store.ts` for any lingering `user.organizationId` reads; the store should store only the active session's `organizationId`, sourced from JWT / refresh.
- Drop the `user.role` display in places where it showed the legacy global role — it's now membership-scoped, sourced from `/me/memberships` or from the active-org server-render.

### 6.6 Performance validation

After 30 days, run a before/after comparison:

- P50, P95, P99 on: `/users/me`, `/organizations/my-memberships`, any permission-check-heavy endpoint (e.g., `/projects/:id/board`).
- Expected delta: <10% regression (the extra JOIN in `getMembers` is the biggest cost; everything else is net simpler).
- If any endpoint regressed >10%, investigate — likely a missing index or N+1 query.

### 6.7 New-feature unlocks

Items that were blocked before and are now trivially implementable — schedule as follow-up work:

- **Multi-org dashboard** — a user's home page can legitimately show work from all their active memberships now.
- **Org-transfer UX** for ownership (Q4 answered — build the Transfer Ownership modal).
- **"Leave workspace" in settings** (M9 from the design doc).
- **Self-service account deletion** (R8, Q5 answered).
- **Per-org notification preferences** — the `organization_members.notification_prefs` jsonb column already exists, just needs UI.
- **Per-org API keys** — reshape existing API keys to be membership-scoped (Z8).

### 6.8 Tests — raise the bar

Now that the architecture is clean, add the tests that would catch a regression:

- E2E test: user invited to two orgs, accepts both, sees both in switcher, role changes in one don't affect the other
- E2E test: Jira migration into Org A, then Org B, same user's `organization_members.jira_account_id` differs per org
- E2E test: deactivate in Org A, confirm user still accesses Org B
- Load test: 1000 concurrent role changes across 100 orgs → `version` concurrency control holds
- Fuzz test: random concurrent invite/accept/revoke flows → invariant cron stays at 0

Target: 95%+ coverage on `organizations.service.ts`, `auth.service.ts`, `invitations.service.ts`, `permissions.service.ts`.

---

## Success metrics (30-day review)

Numbers to capture and publish:

| Metric | Baseline (pre-redesign) | Target | Measurement |
|---|---|---|---|
| Cross-org bugs / week | 8 in 12 hours (Apr 21–22) | 0 for 30 days | Sentry / customer reports |
| Drift audit non-zero incidents | N/A (didn't exist) | 0 | Drift cron log |
| P95 auth endpoint latency | X ms | <1.1× X | Grafana |
| Support tickets "wrong workspace" | ??? | 0 | Zendesk / tags |
| Lines of code in membership-adjacent services | ~X | ~0.7–0.8× X | cloc |

Publish these internally so the team sees the payoff of the refactor.

---

## Completion criteria

- [ ] Expired-invitations cron running hourly
- [ ] All transition flags removed
- [ ] Drift service renamed and trimmed
- [ ] Docs updated
- [ ] Frontend legacy reads purged
- [ ] Performance validation complete, no regressions >10%
- [ ] Follow-up feature tickets filed (6.7)
- [ ] 30-day metrics snapshot published

---

## Done

Multi-tenant architecture transition complete. From here on, every new feature sits on a clean per-org foundation. No more Apr-21-style bug clusters.

Archive this directory under `docs/superpowers/plans/archive/` with a pointer in `CLAUDE.md` so future engineers can understand the historical shape.
