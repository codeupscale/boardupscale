# Multi-Tenant Architecture Transition — Master Plan (v2)

**Design doc:** `../../specs/2026-04-22-multi-tenant-architecture.md`
**Status:** Approved, ready to execute
**Revision history:**
- v1: initial plan (2026-04-22)
- v2: senior-architect review — added Phase 0.5 (data cleanup), testing-strategy.md, canary-org mechanism, chunked backfill, re-ordered Phase 3 subphases, forced re-auth before Phase 5, performance baseline capture

**Total effort:** ~4 weeks of active engineering across 7 weeks calendar (soak + drill windows).

---

## Decisions locked (from design review)

| # | Decision | Choice |
|---|---|---|
| Q1 | Role badge across orgs | **Per-org** (membership authority) |
| Q2 | Default workspace on login | **Picker + pre-select most-recently-used** (fallback `is_default`) |
| Q3 | Invite email for existing users | **Auto-add + "You've been added" notification** |
| Q4 | Last-owner leaves | **Transfer Ownership modal** required first |
| Q5 | Self-service account deletion | **Yes** — soft-delete with tombstone |
| Q6 | Duplicate pending invite same `(email, org)` | **409 with "already pending — resend or revoke"** |
| Q7 | `jira_account_id` location | **Per-membership** (`organization_members.jira_account_id`) |
| Q8 | Invitation expiry cleanup | **BullMQ repeatable job** |

---

## Changes in v2 (what the senior-architect review added)

1. **Phase 0.5 — production data audit + cleanup.** Before touching schema, fix the dirt that's already in prod (stale `organization_id`, admin with `role='member'`, zombie rows, expired invites). Migrating this data preserves bugs. See `phase-0.5-data-cleanup.md`.

2. **Dedicated `testing-strategy.md`.** Tests become a gate, not a suggestion. Coverage targets, exact commands, per-phase test contracts, CI rules. See `testing-strategy.md`.

3. **Canary org mechanism.** Because there's no staging: create a "Canary QA" org in prod. Every flag flip goes to the canary first (6–12h), then global. Built into Phase 2 feature-flag shape.

4. **Chunked backfills.** Every bulk UPDATE in migrations chunks in 1000-row batches with commits between, so table locks stay under a second.

5. **Re-ordered Phase 3 subphases.** `3g` (JWT `membership_version`) — the highest-risk one — gets its own 72h canary soak and a load test before global flip.

6. **Forced re-auth checkpoint before Phase 5.** Every session with a legacy JWT claim is invalidated before the columns go away.

7. **Performance baseline captured in Phase 0.** Every subsequent phase measures against it; >10% regression blocks the phase.

8. **Rollback drills required.** Every phase's rollback command is drilled on a shadow DB BEFORE its phase ships. Logged in `drill-log.md`.

9. **Shadow DB from prod snapshot.** Since there's no staging, a prod-snapshot clone on a sibling host is where every migration and remediation dry-runs first.

---

## Phase order

Each phase is independently shippable and revertible. Do not start a phase until the prior phase's completion criteria are met AND the matching test contract in `testing-strategy.md §7` is satisfied.

| # | Phase | File | Duration | Deploy count | Rollback |
|---|---|---|---|---|---|
| 0 | Drift audit + perf baseline | `phase-0-drift-audit.md` | 1 day | 1 | Pure additive |
| **0.5** | **Production data audit + cleanup** | **`phase-0.5-data-cleanup.md`** | **2–3 days** | **0 (read) + 1 (remediation)** | **Snapshot restore** |
| 1 | Additive schema + backfill | `phase-1-additive-schema.md` | 1 day | 1 (+ snapshot before) | Migration `down()` |
| 2 | Dual-write + canary mechanism | `phase-2-dual-write.md` | 3 days | 1 | Feature flag `DUAL_WRITE_NEW_SHAPE=false` |
| 3 | Flip reads (9 subphases) | `phase-3-flip-reads.md` | 1–2 weeks | 9 (canary → global per subphase) | Per-PR + per-flag revert |
| 4 | Freeze legacy writes + soak | `phase-4-freeze-writes.md` | 3 days + 1 week soak | 1 | `DUAL_WRITE_LEGACY_SHAPE=true` |
| **4.5** | **Forced re-auth checkpoint** | **included in Phase 5** | **0.5 day** | **1** | **Re-issue legacy JWTs** |
| 5 | Drop legacy columns | `phase-5-drop-columns.md` | 1 day (+ snapshot) | 1 | Restore from snapshot |
| 6 | Post-work (crons, docs, cleanup) | `phase-6-post-work.md` | 1 week | 1–2 | N/A |

---

## Global invariants — audit queries that MUST hold at every phase boundary

Run these before starting a phase and before declaring it done. Any non-zero result blocks progression.

### Invariant A: No row loss on any primary table

```sql
-- Record these counts at the start of each phase in runbook
SELECT 'users'                AS t, COUNT(*) FROM users
UNION ALL SELECT 'organization_members', COUNT(*) FROM organization_members
UNION ALL SELECT 'organizations',        COUNT(*) FROM organizations
UNION ALL SELECT 'invitations',          COUNT(*) FROM invitations
UNION ALL SELECT 'issues',               COUNT(*) FROM issues
UNION ALL SELECT 'comments',             COUNT(*) FROM comments
UNION ALL SELECT 'attachments',          COUNT(*) FROM attachments;
-- After the phase: counts must match or increase (never decrease except for explicit delete operations)
```

### Invariant B: No orphaned FK references

```sql
SELECT COUNT(*) FROM issues i     LEFT JOIN users u ON u.id = i.reporter_id   WHERE u.id IS NULL;
SELECT COUNT(*) FROM issues i     LEFT JOIN users u ON u.id = i.assignee_id   WHERE i.assignee_id IS NOT NULL AND u.id IS NULL;
SELECT COUNT(*) FROM comments c   LEFT JOIN users u ON u.id = c.author_id     WHERE u.id IS NULL;
SELECT COUNT(*) FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by  WHERE u.id IS NULL;
SELECT COUNT(*) FROM organization_members m LEFT JOIN users u ON u.id = m.user_id WHERE u.id IS NULL;
SELECT COUNT(*) FROM organization_members m LEFT JOIN organizations o ON o.id = m.organization_id WHERE o.id IS NULL;
```

### Invariant C: No role / access parity drift (Phase 2+ only)

```sql
SELECT COUNT(*)
  FROM organization_members m
  JOIN users u ON u.id = m.user_id
 WHERE u.organization_id = m.organization_id
   AND (u.role IS DISTINCT FROM m.role OR u.is_active IS DISTINCT FROM m.is_active);
```

### Invariant D: No pending-invite drift (Phase 2+ only)

```sql
SELECT COUNT(*)
  FROM users u
 WHERE u.invitation_status = 'pending'
   AND u.email_verification_token IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM invitations i
      WHERE i.email = u.email
        AND i.status = 'pending'
        AND i.organization_id = u.pending_invite_organization_id
   );
```

### Invariant E: Exactly one default membership per user

```sql
SELECT user_id, COUNT(*) FROM organization_members
 WHERE is_default = true GROUP BY user_id HAVING COUNT(*) > 1;
```

### Invariant F: Every org has at least one owner (Phase 0.5+)

```sql
SELECT o.id FROM organizations o
 WHERE NOT EXISTS (
   SELECT 1 FROM organization_members m
    WHERE m.organization_id = o.id AND m.role = 'owner'
 )
 AND EXISTS (
   SELECT 1 FROM organization_members m2 WHERE m2.organization_id = o.id
 );
-- = 0
```

### Invariant G: Every user's `users.organization_id` points at an org they have membership in (Phase 0.5+)

```sql
SELECT COUNT(*) FROM users u
 WHERE u.organization_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM organization_members m
      WHERE m.user_id = u.id AND m.organization_id = u.organization_id
   );
-- = 0 after Phase 0.5
```

---

## Global safety protocol

1. **Backups and snapshots**
   - `pg_dump -Fc` full snapshot before Phase 0.5 AND Phase 1 AND Phase 5. Each retained 30 days, stored off-host.
   - Restore procedure verified on shadow DB before every snapshot-protected phase.
   - WAL archives continuously enabled for point-in-time recovery within 24h windows.

2. **Shadow DB (no staging env)**
   - Clone prod snapshot to `boardupscale_shadow` on a sibling host at the start of Phase 0.
   - Every migration, remediation, and rollback is dry-run here FIRST.
   - Refreshed from a newer snapshot at the start of each major phase.
   - Destroyed at the end of Phase 6.

3. **Canary org in prod**
   - "Canary QA" org created at the start of Phase 1.
   - Seeded with 5 test users covering Owner, Admin, Member, Viewer, and Deactivated states.
   - Every flag flip in Phase 3 goes to canary org first (6–24h), then global.
   - Per-flag check: `canaryOrgIds: string[]` in config overrides the global boolean.

4. **Feature flags**
   - `DUAL_WRITE_NEW_SHAPE` — on in Phase 2, off in Phase 4 rollback scenario
   - `DUAL_WRITE_LEGACY_SHAPE` — on through Phase 3, off in Phase 4
   - `READ_FROM_NEW_SHAPE.<consumer>` — per-consumer, flipped one at a time in Phase 3 (supports canary override)

5. **Monitoring during transition**
   - Drift audit cron every 15 min during Phases 2–4 (hourly outside those windows)
   - Alerts wired to Slack/PostHog on drift > 0
   - API error rate monitored; halt phase if >0.1% regression
   - Performance vs. baseline (captured in Phase 0) monitored on every deploy

6. **Rollback drills**
   - Every rollback command in every phase doc is EXECUTED on the shadow DB before that phase ships.
   - Logged in `drill-log.md` with date, operator, outcome.

7. **No phase runs during a deploy freeze window** (quarter-end, major demos, customer go-lives, etc.)

8. **Every phase ships behind a canary-org soak of ≥6h AND a global soak of ≥24h before the next phase starts.**

---

## Test-first gate

Every phase has a matching section in `testing-strategy.md §7` that enumerates the tests that must be green before the phase ships. No exceptions.

Summary:

- **Unit**: ≥90% coverage on modules touched (auth, organizations, invitations, permissions, guards)
- **Integration**: 12 critical flows (see §3 of testing-strategy.md) pass at every phase boundary
- **Migration**: up + down verified on shadow DB for every new migration
- **E2E**: 8 Playwright browser journeys (Phase 3+)
- **Load**: k6 concurrency test before Phase 4
- **Canary smoke**: exercised in prod on the Canary QA org before every global flip

---

## Success criteria (measured 30 days after Phase 5)

- Zero cross-org bugs reported (baseline: 8 fixed Apr 21–22 in 12 hours)
- Drift audit returns 0 for 30 consecutive days
- P95 latency on any authenticated request regresses by <10%
- Row counts match pre/post for every table except `users` (columns dropped, rows untouched)
- No support tickets about "can't see my workspace" or "invite landed in wrong org"
- Zero hotfix migrations
- Self-service account deletion works end-to-end (from Q5)
- Transfer-ownership modal works end-to-end (from Q4)
- Workspace switcher remembers most-recently-used (from Q2)

---

## If something goes wrong

Each phase file has a **Rollback** section with the exact command sequence. General principle:

- **Phases 0–0.5**: transactional; automatic ROLLBACK if invariants fail
- **Phases 1–3**: revert the latest PR; data is preserved because dual-write kept both shapes in sync
- **Phase 4**: flip the feature flag; dual-write resumes; data catches up in seconds
- **Phase 5**: restore from snapshot + redeploy prior commit; data from the monitoring window replayed from WAL archives if needed

Do not attempt a rollback past the most recent phase boundary without running the downgrade migration explicitly AND having the matching snapshot restored.

---

## Files in this plan

- `README.md` — this file, master index
- `testing-strategy.md` — test gate, coverage targets, canary-org mechanism
- `phase-0-drift-audit.md` — observability + perf baseline
- `phase-0.5-data-cleanup.md` — production data audit + remediation (NEW in v2)
- `phase-1-additive-schema.md` — new columns + invitations table + backfill
- `phase-2-dual-write.md` — every write to both shapes + canary flag
- `phase-3-flip-reads.md` — 9 subphases, canary-first rollouts
- `phase-4-freeze-writes.md` — stop writing legacy; 1-week soak
- `phase-5-drop-columns.md` — drop legacy columns + forced re-auth
- `phase-6-post-work.md` — crons, docs, transition flag removal
- `drill-log.md` — rollback drill records (created during Phase 0)
- `baselines/` — performance baseline artifacts (captured in Phase 0)
