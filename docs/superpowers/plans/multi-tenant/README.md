# Multi-Tenant Architecture Transition — Master Plan

**Design doc:** `../../specs/2026-04-22-multi-tenant-architecture.md`
**Status:** Approved, ready to execute
**Total effort:** ~3 weeks of active engineering across 6 weeks calendar (soak windows padded)

---

## Decisions locked (from design review)

| # | Decision | Choice |
|---|---|---|
| Q1 | Role badge across orgs | **Per-org** (membership authority) |
| Q2 | Default workspace on login | **Picker + pre-select most-recently-used** (fallback to `is_default`) |
| Q3 | Invite email for existing users | **Auto-add + "You've been added" notification** (no accept click) |
| Q4 | Last-owner leaves | **Transfer Ownership modal** required first |
| Q5 | Self-service account deletion | **Yes** — soft-delete with tombstone |
| Q6 | Duplicate pending invite same (email, org) | **409 with "already pending — resend or revoke"** |
| Q7 | `jira_account_id` location | **Per-membership** (`organization_members.jira_account_id`) |
| Q8 | Invitation expiry cleanup | **BullMQ repeatable job** in worker service |

---

## Phase order

Each phase is independently shippable and revertible. Do not start a phase until the prior phase's completion criteria are met.

| # | Phase | File | Duration | Deploy count | Rollback |
|---|---|---|---|---|---|
| 0 | Drift audit observability | `phase-0-drift-audit.md` | 1 day | 1 | Pure additive, no rollback needed |
| 1 | Additive schema + backfill | `phase-1-additive-schema.md` | 1 day | 1 (+ snapshot before) | Migration `down()` drops new objects |
| 2 | Dual-write (both shapes) | `phase-2-dual-write.md` | 3 days | 1 | Feature flag `DUAL_WRITE_NEW_SHAPE=false` |
| 3 | Flip reads (9 subphases) | `phase-3-flip-reads.md` | 1–2 weeks | 9 (one per consumer) | Per-PR revert; dual-write still running |
| 4 | Freeze legacy writes + soak | `phase-4-freeze-writes.md` | 3 days + 1 week soak | 1 | Feature flag `DUAL_WRITE_LEGACY_SHAPE=true` |
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
UNION ALL SELECT 'issues',               COUNT(*) FROM issues;
-- After the phase: counts must match or increase (never decrease except for explicit delete operations)
```

### Invariant B: No orphaned FK references

```sql
-- Each must return 0
SELECT COUNT(*) FROM issues i     LEFT JOIN users u ON u.id = i.reporter_id   WHERE u.id IS NULL;
SELECT COUNT(*) FROM issues i     LEFT JOIN users u ON u.id = i.assignee_id   WHERE i.assignee_id IS NOT NULL AND u.id IS NULL;
SELECT COUNT(*) FROM comments c   LEFT JOIN users u ON u.id = c.author_id     WHERE u.id IS NULL;
SELECT COUNT(*) FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by  WHERE u.id IS NULL;
SELECT COUNT(*) FROM organization_members m LEFT JOIN users u ON u.id = m.user_id WHERE u.id IS NULL;
SELECT COUNT(*) FROM organization_members m LEFT JOIN organizations o ON o.id = m.organization_id WHERE o.id IS NULL;
```

### Invariant C: No role / access parity drift (Phase 2+ only)

```sql
-- Must return 0. Compares legacy vs new for every (user, org) pair that has both.
SELECT COUNT(*)
  FROM organization_members m
  JOIN users u ON u.id = m.user_id
 WHERE u.organization_id = m.organization_id
   AND (u.role IS DISTINCT FROM m.role OR u.is_active IS DISTINCT FROM m.is_active);
```

### Invariant D: No pending-invite drift (Phase 2+ only)

```sql
-- Must return 0 — every legacy pending invite has a corresponding invitations row
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
-- Must return 0 rows
SELECT user_id, COUNT(*) FROM organization_members
 WHERE is_default = true GROUP BY user_id HAVING COUNT(*) > 1;
```

---

## Global safety protocol

1. **Backups**
   - `pg_dump` full snapshot before Phase 1 and before Phase 5. Retain 30 days.
   - Verify restore procedure on staging before each snapshot-protected phase.

2. **Feature flags**
   - `DUAL_WRITE_NEW_SHAPE` — on in Phase 2, off in Phase 4 rollback scenario
   - `DUAL_WRITE_LEGACY_SHAPE` — on through Phase 3, off in Phase 4
   - `READ_FROM_NEW_SHAPE` — per-consumer, flipped one at a time in Phase 3

3. **Monitoring during transition**
   - Drift audit cron runs every hour (not daily) during Phases 2–4
   - Alerts wired to Slack/PostHog on drift > 0
   - API error rate monitored; halt phase if >0.1% regression

4. **No phase runs during a deploy freeze window** (end of quarter, major customer demos, etc.)

5. **Every phase ships behind a staging soak of ≥24h** before production.

---

## Success criteria (measured 30 days after Phase 5)

- Zero cross-org bugs reported (baseline: 8 fixed Apr 21–22)
- Drift audit returns 0 for 30 consecutive days
- P95 latency on any authenticated request regresses by <10%
- Row counts match pre/post for every table except `users` (columns dropped, rows untouched)
- No support tickets about "I can't see my workspace" or "invite landed in wrong org"
- No hotfix migrations needed

---

## If something goes wrong

Each phase file has a **Rollback** section with the exact command sequence. General principle:

- **Phases 0–3**: revert the latest PR; data is preserved because dual-write kept both shapes in sync
- **Phase 4**: flip the feature flag; dual-write resumes; data catches up in seconds
- **Phase 5**: only rollback path that touches backups. `RESTORE FROM snapshot_phase_5_pre_drop`; data written in the soak window between snapshot and restore will be lost (target: <24h of writes to replay from WAL if needed)

Do not attempt a rollback past the most recent phase boundary without running the downgrade migration explicitly.
