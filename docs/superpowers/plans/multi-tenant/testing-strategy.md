# Testing Strategy — Multi-Tenant Transition

**Purpose:** make testing a gate, not a suggestion. Every phase has a concrete test plan with exact commands, coverage targets, and CI rules. Nothing ships without matching green CI.

This document is referenced by every phase file. It's the contract between "done" and "shipped."

---

## 1. Test environments

Production is currently the only deployed environment. This plan does NOT ship without addressing that — we use three mechanisms to get staging-like safety:

### 1a. Local developer DB (everyone)

- `docker compose up -d postgres redis`
- `npm --prefix services/api run test:e2e` — runs integration tests against a throwaway DB, migrations auto-applied per test suite.
- Required for unit + integration test authoring.

### 1b. Shadow DB from prod snapshot (dedicated to this project)

- Before Phase 0.5, take a pg_dump of prod.
- Run a copy on a sibling host (`pg_restore -d boardupscale_shadow`).
- Every migration + remediation script is dry-run here FIRST. Record row-count deltas, lock timings, error output.
- Destroyed after Phase 6.

### 1c. Canary org in production (per-flag rollouts)

- Create a dedicated "Canary QA" organization in prod on the day Phase 1 ships.
- Seed with 5 test users across different roles.
- Every subphase flag flip in Phase 3 flips FIRST for the canary org only (via a per-org flag check), soaks 6–12 hours, THEN flips for the rest of prod.
- Mechanism: `config.flags.readFromNewShape.XXX` becomes `{ global: boolean; canaryOrgIds: string[] }` — canary users hit the new path regardless of global flag.

Example check:

```typescript
private isNewShapeEnabled(flagName: string, orgId?: string): boolean {
  const flag = this.flags.readFromNewShape[flagName];
  if (flag.global) return true;
  if (!orgId) return false;
  return flag.canaryOrgIds.includes(orgId);
}
```

This pattern is added in Phase 2 alongside dual-write. No phase is considered "done" until canary has soaked for 6h minimum on that flag.

---

## 2. Test categories and targets

| Category | Tool | Target coverage | Blocking? |
|---|---|---|---|
| Unit — API services | Jest | **≥90%** for any service touched in this project | Yes (CI gate) |
| Unit — guards, interceptors | Jest | **100%** | Yes |
| Integration — end-to-end flows | Jest + real Postgres in docker-compose | 12 critical flows (§3) all passing | Yes |
| Migration — up/down correctness | Custom harness | Every migration in this project | Yes |
| E2E — browser | Playwright (added in this project) | 8 critical user journeys | Yes for Phase 3+ |
| Load — concurrency | k6 script | `version` concurrency holds at 1k rps | Yes before Phase 4 |
| Smoke — canary org in prod | Manual or scripted curl | Every phase | Yes |

CI config updates (`.github/workflows/ci.yml`):

- Fail the build if coverage regresses on:
  - `services/api/src/modules/auth/**`
  - `services/api/src/modules/organizations/**`
  - `services/api/src/modules/invitations/**` (new)
  - `services/api/src/modules/permissions/**`
  - `services/api/src/common/guards/**`
- Add a dedicated job: "Multi-Tenant Migration Safety" — runs every migration up+down against a fresh DB, fails if down() doesn't cleanly reverse up().

---

## 3. The 12 critical integration flows

Each has a dedicated `*.integration.spec.ts` that MUST pass at every phase boundary.

1. **Register → create-own-org → verify membership**
   - Expected: `users` row, `organizations` row, `organization_members(role=owner, is_default=true)`.
2. **Admin invites brand-new email → recipient clicks → registers → lands in correct org**
   - Expected: `invitations` row transitions pending → accepted; new `users` row; new `organization_members`.
3. **Admin invites existing active user → they get "added to workspace" notification, no token click needed**
   - Expected: NO new `invitations` row created; `organization_members` row inserted immediately.
4. **Cross-org invite: user exists in Org A (via Jira placeholder), Admin of Org B invites them**
   - Expected: after accept, user sees ONLY Org B (Phase 3f+), not Org A; `users.organization_id` points at Org B.
5. **Concurrent invites to same (email, org) → second returns 409**
   - Expected: first row in `invitations` with status='pending'; second insert hits `uq_invitations_pending_per_org`; API returns 409 with `code=INVITE_PENDING`.
6. **Concurrent invites to different orgs for same email → both succeed, both emails valid**
   - Expected: two `invitations` rows; user can accept either, both, or neither.
7. **Deactivate in Org A, user still active in Org B**
   - Expected: `organization_members(org=A).is_active=false`; `organization_members(org=B).is_active=true`; login succeeds landing in B.
8. **Jira migrate into Org A, then Org B, same email**
   - Expected: one `users` row; two `organization_members` rows; `jira_account_id` per-org differs if Jira sites differ.
9. **Role change in Org A doesn't affect Org B**
   - Expected: `organization_members(org=A).role='admin'`; `organization_members(org=B).role='member'` unchanged.
10. **Last owner demotes self → 400 with "transfer ownership first"**
    - Expected: role remains 'owner'; no writes; error code `LAST_OWNER_BLOCKED`.
11. **User deletes own account (GDPR) → tombstoned; issues still resolve reporter**
    - Expected: `users.deleted_at IS NOT NULL`; all `organization_members` rows CASCADE-deleted; `issues.reporter_id` still FK-valid (tombstone user stays); login blocked.
12. **Session invalidation on role change**
    - Expected: `organization_members.version` bumps on role change; next request from old JWT returns 401 `code=SESSION_STALE`; refresh yields new JWT.

Each flow lives in `services/api/src/test/multi-tenant/<flow-name>.integration.spec.ts`.

---

## 4. Browser E2E (Playwright) — 8 critical journeys

Added in Phase 0.5 so they're available from Phase 1 onward. Configured against `staging` → after Phase 2, run against prod canary org.

1. Sign up new account → create workspace → invite teammate → teammate accepts
2. Invited user with existing account → accept → workspace switcher now lists both orgs
3. Role change via UI → page reloads → correct role badge visible
4. Deactivate via UI → deactivated user redirected to "no workspace access" page
5. Workspace switcher → picker opens → pre-select = most-recently-used (Q2)
6. Revoke pending invite → clicking the email link now shows "revoked"
7. Transfer ownership modal → picks new owner → old owner demoted to admin
8. Self-service account deletion → confirm modal → account gone from switcher

Each journey has its own `*.spec.ts` in `services/web/e2e/multi-tenant/`. Parallelized across headed Chromium only (we don't need cross-browser for this project).

---

## 5. Load / concurrency tests (k6)

Script: `scripts/load/multi-tenant-concurrency.js`

Simulates:
- 1000 concurrent virtual users
- Each VU loops: log in → change own display name → log out
- 10% of VUs additionally trigger a role change on their membership (via admin account)
- Run for 5 minutes

Pass criteria:
- P95 latency regresses <10% vs baseline
- Zero 5xx errors
- No drift audit failures during the run
- `organization_members.version` increments atomically (spot-check: all update counts accounted for)

Run before Phase 4 deploy.

---

## 6. Migration tests

`services/api/src/database/migrations/multi-tenant-migration.spec.ts` — a harness that:

1. Spins up a fresh Postgres container (docker-compose)
2. Runs migrations up to `1744500000000-JiraMemberReconciliation` (the last pre-project migration)
3. Seeds a representative data set (script in `src/test/fixtures/multi-tenant-seed.ts`):
   - 3 orgs, each with 1 owner, 2 admins, 5 members
   - 2 users with memberships in 2 orgs each
   - 1 user with pending invite
   - 1 user that's Jira-migrated (has `jira_account_id`)
   - 1 user with deactivated status
   - 1 "broken" user (has `users.organization_id` pointing at org with no membership — simulates the production dirt)
4. For each new migration in this project:
   - Records row counts before
   - Runs `up()`
   - Records row counts after
   - Asserts counts match or (for explicit migrations like cleanup) match expected deltas
   - Runs `down()`
   - Asserts state matches pre-`up()` snapshot (to the extent down() promises)
5. Fails CI if any step fails.

---

## 7. Per-phase test contract

### Phase 0 (drift observability)

- [ ] 4 new unit tests for `MultiTenantDriftService`
- [ ] 2 new unit tests for BullMQ worker
- [ ] Coverage on `audit/` module ≥ 90%
- [ ] CI passes

### Phase 0.5 (data audit + cleanup)

- [ ] Audit script runs successfully on shadow DB; output reviewed
- [ ] Remediation script dry-run on shadow DB; invariant assertions pass
- [ ] 12 integration flows still pass after remediation
- [ ] Manual smoke: invite + accept flow on canary org works pre- and post-remediation

### Phase 1 (additive schema)

- [ ] Migration test (§6) passes up+down for `1744700000000-MultiTenantPhase1`
- [ ] 6 post-deploy audit queries return expected values (in phase-1 doc)
- [ ] Integration tests 1–12 still pass (old shape still works)
- [ ] Row counts pre/post identical for every non-migrated table
- [ ] Drift audit returns 0 immediately after migration
- [ ] Staging soak ≥24h before prod (dry-run on shadow; canary is seeded post-deploy)

### Phase 2 (dual-write)

- [ ] 6 new unit tests for `InvitationsService`
- [ ] Every updated service method has at least one test verifying BOTH the old and new shape get the write
- [ ] Drift audit extended with Invariants C + D; CI verifies they return 0 on a clean seed
- [ ] Coverage on `invitations/` module ≥ 90%
- [ ] Coverage on modified `auth/`, `organizations/` services ≥ 90%
- [ ] 48h canary soak with `DUAL_WRITE_NEW_SHAPE=true`; drift audit remains 0

### Phase 3 (flip reads, 9 subphases)

- [ ] EACH subphase ships with:
  - A flag-on unit test and a flag-off unit test
  - An integration test exercising the flipped read
  - A documented canary soak window (6–24h depending on subphase risk)
- [ ] Subphase 3g (JWT version) requires special treatment:
  - ≥72h canary soak
  - Load test (§5) must pass with the flag on before prod rollout
  - Frontend refresh-on-401 logic re-tested manually
- [ ] Drift audit remains 0 across all subphases
- [ ] E2E suite (§4) runs green before each subphase flag flip

### Phase 4 (freeze legacy writes)

- [ ] New integration test `organizations.service.legacy-frozen.spec.ts` — verifies legacy columns don't receive writes
- [ ] `LEGACY_ACCESS_LOG=true` for 48h; zero warnings in last 24h before proceeding
- [ ] Canary soak ≥1 week with `DUAL_WRITE_LEGACY_SHAPE=false`
- [ ] Load test (§5) re-run; still within 10% baseline

### Phase 5 (drop columns)

- [ ] Migration test (§6) for `1744800000000-MultiTenantPhase5` up+down (knowing down() is lossy)
- [ ] Code grep finds ZERO references to dropped columns (API + web + worker)
- [ ] 12 integration flows pass on shadow DB with the new schema
- [ ] Canary org regression-tested end-to-end with new schema
- [ ] Rollback drill completed on shadow DB (restore from snapshot, verify service boots)

### Phase 6 (post-work)

- [ ] Expired-invitations cron has unit tests
- [ ] All transition flags removed with matching test updates
- [ ] 30-day metrics captured vs pre-project baseline
- [ ] Final drift audit run; all invariants clean

---

## 8. Performance baseline — captured in Phase 0

Before Phase 1 runs:

```bash
# Run this 3 times, average the P50/P95
k6 run scripts/load/multi-tenant-baseline.js \
  --duration 5m \
  --vus 100 \
  --out json=baseline-$(date +%F).json
```

Metrics to capture:
- `/users/me` P50 / P95 / P99
- `/organizations/my-memberships` P50 / P95 / P99
- `/projects/:id/board` P50 / P95 / P99
- `/files/upload` P50 / P95
- Authenticated request overall P95
- DB query time: longest 5 queries (from pg_stat_statements)

Stored in the repo as `docs/superpowers/plans/multi-tenant/baselines/baseline-<date>.json`.

Every subsequent phase deploy runs the same script, diffs against baseline. >10% regression = investigate; blocked from proceeding until resolved.

---

## 9. Rollback drills

Every rollback command in every phase file is DRILLED at least once on the shadow DB before its phase ships:

- Phase 1: run migration, drop the new objects via down(), verify shadow still matches source snapshot.
- Phase 2: toggle the flag off, submit a write, verify new-shape wasn't touched; toggle back on, verify catch-up write happens.
- Phase 3: per-subphase flag rollback — verify legacy read path still produces correct responses.
- Phase 4: toggle `DUAL_WRITE_LEGACY_SHAPE=true`, submit a write, verify both shapes populated.
- Phase 5: restore from snapshot on shadow; confirm application boots cleanly with old entity + columns.

Drills are logged in `docs/superpowers/plans/multi-tenant/drill-log.md`. No phase ships without its drill entry.

---

## 10. Test execution commands (copy-paste ready)

```bash
# Unit tests — API
cd services/api && npx jest --coverage --coverageThreshold='{"global":{"branches":80,"lines":90}}'

# Unit tests — worker
cd services/worker && npx jest --coverage

# Integration tests — multi-tenant flows
cd services/api && npx jest src/test/multi-tenant/ --runInBand --forceExit

# Migration tests
cd services/api && npx jest src/database/migrations/multi-tenant-migration.spec.ts --runInBand

# E2E (Playwright, requires running app)
cd services/web && npx playwright test e2e/multi-tenant/

# Load test (requires k6)
k6 run scripts/load/multi-tenant-concurrency.js

# Full pre-phase gate (run these in order; must all pass)
npm run test:multi-tenant-gate   # aggregator script added in Phase 0.5
```

`services/api/package.json` gets:

```json
"scripts": {
  "test:multi-tenant-gate": "npm-run-all -p test:unit test:integration test:migration"
}
```

(And matching in web/ for E2E.)

---

## 11. Non-negotiables

1. Every phase must ship **only** with all §7 items ticked.
2. Coverage must never regress on modules listed in §2.
3. Every new migration has a passing up+down test BEFORE merge.
4. Every rollback command is drilled on shadow before its phase.
5. Any drift audit non-zero result halts all further phases until resolved.
6. Canary org soak times are minimums; extend freely if anything looks off.

If any of these feels like too much process: remember we fixed 8 cross-org bugs in 12 hours because shortcuts were taken. This is the insurance.
