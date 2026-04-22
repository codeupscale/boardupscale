# Phase 0.5 — Production Data Audit + Cleanup

**Goal:** before moving any schema, find and fix the inconsistencies in the current production data. Migrating dirty data preserves bugs; clean it first.

**Duration:** 2–3 days
**Deploys:** 0 (read-only audit scripts) + 1 (remediation script run once against prod)
**Prerequisites:** Phase 0 drift audit running for ≥3 days
**Rollback:** Every remediation runs inside a transaction; if any assertion fails, ROLLBACK. Separately: DB snapshot before the remediation script runs.

---

## Why this phase exists

v1 of the plan went straight from Phase 0 to Phase 1. I was wrong — the existing prod database has known inconsistencies from 6+ months of accumulated bugs:

- Admin user whose `users.role='member'` even though they're owner via `organization_members`
- 248 Jira-placeholder users in `Rohail's Workspace` that nobody actually joined
- Users with `organization_id` pointing at orgs they have no membership in
- Users with `organization_members` rows but `users.organization_id` points elsewhere
- Potentially: zombie `organization_members` rows referencing deleted orgs (the FK SHOULD prevent this, but worth verifying)

Migrating this data straight into the new shape would backfill the dirt into `organization_members.role`, `.is_default`, etc. — and we'd ship the bugs forward.

**Principle:** audit first, remediate known dirt in a controlled script, THEN migrate.

---

## Pre-flight

- [ ] DB snapshot `snapshot_phase_0_5_pre_audit_<ts>.dump` taken and verified
- [ ] Audit queries reviewed by a second engineer before running remediation
- [ ] No active Jira migrations in flight

---

## Step 1 — Run the full audit (read-only)

Script: `services/api/scripts/audit-multi-tenant-state.sql`

```sql
-- ═══════════════════════════════════════════════════════════════════
--  Multi-tenant data audit — read-only
--  Prints a report of every inconsistency category.
--  Save the output; each category becomes a remediation in Step 2.
-- ═══════════════════════════════════════════════════════════════════

\echo '=== Category 1: users.role mismatch with organization_members.role ==='
SELECT u.id, u.email, u.role AS legacy_role, m.role AS membership_role,
       m.organization_id
  FROM users u
  JOIN organization_members m
    ON m.user_id = u.id AND m.organization_id = u.organization_id
 WHERE u.role IS DISTINCT FROM m.role
 ORDER BY u.email;

\echo '=== Category 2: users.is_active mismatch with organization_members.is_active (legacy) ==='
-- Skip if Phase 1 hasn't run yet (is_active column doesn't exist on org_members)
-- Re-run after Phase 1.

\echo '=== Category 3: users with organization_id pointing to org they have NO membership in ==='
SELECT u.id, u.email, u.organization_id AS claimed_org,
       (SELECT name FROM organizations WHERE id = u.organization_id) AS org_name
  FROM users u
 WHERE u.organization_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM organization_members m
      WHERE m.user_id = u.id AND m.organization_id = u.organization_id
   )
 ORDER BY u.email;

\echo '=== Category 4: users with memberships but organization_id is NULL ==='
SELECT u.id, u.email, COUNT(m.*) AS membership_count
  FROM users u
  LEFT JOIN organization_members m ON m.user_id = u.id
 WHERE u.organization_id IS NULL
 GROUP BY u.id, u.email
HAVING COUNT(m.*) > 0
 ORDER BY u.email;

\echo '=== Category 5: zombie organization_members (user or org deleted) ==='
SELECT m.user_id, m.organization_id, m.role
  FROM organization_members m
  LEFT JOIN users u ON u.id = m.user_id
  LEFT JOIN organizations o ON o.id = m.organization_id
 WHERE u.id IS NULL OR o.id IS NULL
 LIMIT 200;

\echo '=== Category 6: users with pending invitation status but no token (dead state) ==='
SELECT u.id, u.email, u.organization_id, u.pending_invite_organization_id
  FROM users u
 WHERE u.invitation_status = 'pending'
   AND (u.email_verification_token IS NULL
        OR u.email_verification_expiry IS NULL
        OR u.email_verification_expiry < NOW())
 ORDER BY u.email;

\echo '=== Category 7: users with token but no invitation_status=pending (orphan token) ==='
SELECT u.id, u.email, u.invitation_status
  FROM users u
 WHERE u.email_verification_token IS NOT NULL
   AND u.invitation_status != 'pending'
 ORDER BY u.email;

\echo '=== Category 8: users with jira_account_id but no matching organization_members row in any org ==='
SELECT u.id, u.email, u.jira_account_id, u.organization_id
  FROM users u
 WHERE u.jira_account_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM organization_members WHERE user_id = u.id)
 ORDER BY u.email;

\echo '=== Category 9: Jira-placeholder users (no password) grouped by org ==='
SELECT o.id, o.name, COUNT(*) AS placeholder_count
  FROM users u
  JOIN organization_members m ON m.user_id = u.id
  JOIN organizations o ON o.id = m.organization_id
 WHERE u.password_hash IS NULL
   AND u.jira_account_id IS NOT NULL
 GROUP BY o.id, o.name
 ORDER BY placeholder_count DESC;

\echo '=== Category 10: users whose pending_invite_organization_id does NOT match their org_members ==='
SELECT u.id, u.email, u.pending_invite_organization_id,
       (SELECT array_agg(organization_id) FROM organization_members WHERE user_id = u.id) AS actual_memberships
  FROM users u
 WHERE u.pending_invite_organization_id IS NOT NULL
 ORDER BY u.email;

\echo '=== Category 11: duplicate (email, organization_id) "identities" (Jira dedup slip-through) ==='
-- After Phase 1 migration, email becomes CITEXT, so case-only duplicates surface here.
SELECT LOWER(email) AS email_lower, COUNT(*) AS dup_count
  FROM users
 GROUP BY LOWER(email)
HAVING COUNT(*) > 1;

\echo '=== Category 12: orgs with zero active members (unmanageable) ==='
SELECT o.id, o.name
  FROM organizations o
 WHERE NOT EXISTS (
   SELECT 1 FROM organization_members m
    WHERE m.organization_id = o.id
      -- Once Phase 1 adds is_active, also filter by m.is_active=true
 )
 ORDER BY o.name;

\echo '=== Category 13: orgs with no owner ==='
SELECT o.id, o.name
  FROM organizations o
 WHERE NOT EXISTS (
   SELECT 1 FROM organization_members m
    WHERE m.organization_id = o.id AND m.role = 'owner'
 )
 ORDER BY o.name;

\echo '=== Summary counts ==='
SELECT 'total users'        AS metric, COUNT(*)::text FROM users
UNION ALL SELECT 'total orgs',          COUNT(*)::text FROM organizations
UNION ALL SELECT 'total org_members',   COUNT(*)::text FROM organization_members
UNION ALL SELECT 'users.role=owner',    COUNT(*)::text FROM users WHERE role = 'owner'
UNION ALL SELECT 'users.role=admin',    COUNT(*)::text FROM users WHERE role = 'admin'
UNION ALL SELECT 'users.role=member',   COUNT(*)::text FROM users WHERE role = 'member'
UNION ALL SELECT 'orgs with >1 member', COUNT(*)::text
  FROM (SELECT organization_id FROM organization_members
         GROUP BY organization_id HAVING COUNT(*) > 1) x;
```

Run:

```bash
docker cp services/api/scripts/audit-multi-tenant-state.sql infra-postgres-1:/tmp/
docker exec infra-postgres-1 psql -U boardupscale -d boardupscale \
  -f /tmp/audit-multi-tenant-state.sql > /tmp/audit-report-$(date +%F).txt 2>&1
```

Save the output as an artifact. Every non-empty result set is a remediation the team must sign off on before Step 2.

---

## Step 2 — Remediation script (transactional, dry-run first)

Script: `services/api/scripts/remediate-multi-tenant-state.sql`

Runs in a single transaction. Each remediation has:
- A COUNT BEFORE (logged)
- The fix
- A COUNT AFTER (logged)
- An assertion that CANNOT be violated or the transaction rolls back

```sql
BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- Remediation 1: sync users.role from organization_members.role where
-- the user's home org matches (fixes the "admin is shown as member" bug).
-- NOTE: This only touches rows where org_members is the source of truth.
-- ═══════════════════════════════════════════════════════════════════
\echo '--- Remediation 1: users.role = membership.role (home org) ---'
CREATE TEMP TABLE r1_candidates AS
  SELECT u.id AS user_id, u.role AS old_role, m.role AS new_role
    FROM users u
    JOIN organization_members m
      ON m.user_id = u.id AND m.organization_id = u.organization_id
   WHERE u.role IS DISTINCT FROM m.role;

SELECT COUNT(*) AS before_count FROM r1_candidates;

UPDATE users u
   SET role = m.role, updated_at = NOW()
  FROM organization_members m
 WHERE m.user_id = u.id
   AND m.organization_id = u.organization_id
   AND u.role IS DISTINCT FROM m.role;

SELECT COUNT(*) AS after_count
  FROM users u
  JOIN organization_members m
    ON m.user_id = u.id AND m.organization_id = u.organization_id
 WHERE u.role IS DISTINCT FROM m.role;
-- Must be 0. If not, rollback.
DO $$
DECLARE remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining
    FROM users u JOIN organization_members m
      ON m.user_id = u.id AND m.organization_id = u.organization_id
   WHERE u.role IS DISTINCT FROM m.role;
  IF remaining > 0 THEN RAISE EXCEPTION 'R1 post-check failed: % rows still differ', remaining; END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- Remediation 2: users with organization_id pointing to an org they
-- have no membership in. This is always a bug (happened when Jira
-- migrations updated user rows without creating memberships — fixed
-- in hotfixes but historical data persists).
--
-- Strategy:
--   - If user has any OTHER active memberships → point users.organization_id
--     at the "best" one (most recent activity, else oldest).
--   - If user has no memberships at all → point users.organization_id to
--     NULL, so getMembers() legacy-union path stops including them.
-- ═══════════════════════════════════════════════════════════════════
\echo '--- Remediation 2: fix users.organization_id pointing to non-member org ---'
WITH misrouted AS (
  SELECT u.id AS user_id, u.organization_id AS stale_org
    FROM users u
   WHERE u.organization_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM organization_members m
        WHERE m.user_id = u.id AND m.organization_id = u.organization_id
     )
),
best_membership AS (
  SELECT DISTINCT ON (m.user_id) m.user_id, m.organization_id
    FROM organization_members m
   WHERE m.user_id IN (SELECT user_id FROM misrouted)
   ORDER BY m.user_id, m.created_at ASC
)
UPDATE users u
   SET organization_id = COALESCE(bm.organization_id, NULL),
       updated_at = NOW()
  FROM misrouted mis
  LEFT JOIN best_membership bm ON bm.user_id = mis.user_id
 WHERE u.id = mis.user_id;

-- Post-check
DO $$
DECLARE remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining FROM users u
   WHERE u.organization_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM organization_members m
        WHERE m.user_id = u.id AND m.organization_id = u.organization_id
     );
  IF remaining > 0 THEN RAISE EXCEPTION 'R2 post-check failed: % rows still misrouted', remaining; END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- Remediation 3: users with memberships but organization_id=NULL.
-- Point them at their oldest membership as their "home".
-- ═══════════════════════════════════════════════════════════════════
\echo '--- Remediation 3: set users.organization_id for users with memberships ---'
WITH homeless AS (
  SELECT u.id AS user_id FROM users u
   WHERE u.organization_id IS NULL
     AND EXISTS (SELECT 1 FROM organization_members m WHERE m.user_id = u.id)
),
best AS (
  SELECT DISTINCT ON (m.user_id) m.user_id, m.organization_id
    FROM organization_members m
   WHERE m.user_id IN (SELECT user_id FROM homeless)
   ORDER BY m.user_id, m.created_at ASC
)
UPDATE users u
   SET organization_id = best.organization_id, updated_at = NOW()
  FROM best
 WHERE u.id = best.user_id;


-- ═══════════════════════════════════════════════════════════════════
-- Remediation 4: orphan pending-invite tokens (expired or status mismatch).
-- If the invitation is dead data, clear the columns so Phase 1 doesn't
-- migrate garbage into the invitations table.
-- ═══════════════════════════════════════════════════════════════════
\echo '--- Remediation 4: clear dead pending-invite state ---'
UPDATE users
   SET invitation_status = 'expired',
       email_verification_token = NULL,
       email_verification_expiry = NULL,
       pending_invite_organization_id = NULL,
       updated_at = NOW()
 WHERE invitation_status = 'pending'
   AND (email_verification_expiry IS NULL OR email_verification_expiry < NOW());

UPDATE users
   SET email_verification_token = NULL,
       email_verification_expiry = NULL,
       updated_at = NOW()
 WHERE email_verification_token IS NOT NULL
   AND invitation_status != 'pending';


-- ═══════════════════════════════════════════════════════════════════
-- Remediation 5: orgs with zero active members — mark as inactive.
-- Do NOT delete; keep for forensic/audit purposes.
-- ═══════════════════════════════════════════════════════════════════
\echo '--- Remediation 5: flag empty orgs ---'
UPDATE organizations
   SET updated_at = NOW()  -- placeholder — mark via future orgs.status='empty'
 WHERE NOT EXISTS (
   SELECT 1 FROM organization_members m WHERE m.organization_id = organizations.id
 );
-- (Phase 1+ will add organizations.status; nothing to do now beyond noting them.)


-- ═══════════════════════════════════════════════════════════════════
-- Remediation 6: every org must have at least one owner. If none,
-- promote the most-senior admin. If no admin either, log for manual fix.
-- ═══════════════════════════════════════════════════════════════════
\echo '--- Remediation 6: ensure every org has an owner ---'
UPDATE organization_members m
   SET role = 'owner', updated_at = NOW()
 WHERE m.role = 'admin'
   AND m.organization_id IN (
     SELECT o.id FROM organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM organization_members m2
         WHERE m2.organization_id = o.id AND m2.role = 'owner'
      )
   )
   AND m.created_at = (
     SELECT MIN(m3.created_at) FROM organization_members m3
      WHERE m3.organization_id = m.organization_id AND m3.role = 'admin'
   );

-- Log any org still without an owner
SELECT o.id, o.name, 'NO_OWNER' AS warning
  FROM organizations o
 WHERE NOT EXISTS (
   SELECT 1 FROM organization_members m
    WHERE m.organization_id = o.id AND m.role = 'owner'
 );
-- If this returns rows, investigate manually. Don't auto-fix.


-- ═══════════════════════════════════════════════════════════════════
-- Remediation 7: case-duplicate emails (same email, different case).
-- If Phase 1 converts email → CITEXT, these become hard conflicts.
-- Merge or manual review.
-- ═══════════════════════════════════════════════════════════════════
\echo '--- Remediation 7: case-duplicate emails ---'
-- Report only. Do not auto-merge — requires human review.
SELECT LOWER(email) AS email_lower, array_agg(id) AS user_ids, COUNT(*)
  FROM users
 GROUP BY LOWER(email)
HAVING COUNT(*) > 1;
-- Human must: decide keeper row, reassign FKs, delete losers.


-- ═══════════════════════════════════════════════════════════════════
-- Remediation 8: jira_account_id without a corresponding membership.
-- If the user has at least one org_members row, the jira_account_id
-- gets copied there by Phase 1's backfill anyway; nothing to do.
-- If the user has NO org_members rows, clear jira_account_id — it
-- can't be resolved anyway.
-- ═══════════════════════════════════════════════════════════════════
\echo '--- Remediation 8: clear orphan jira_account_id ---'
UPDATE users
   SET jira_account_id = NULL, updated_at = NOW()
 WHERE jira_account_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM organization_members WHERE user_id = users.id);


-- Final invariant check before commit
\echo '=== Final invariants ==='
DO $$
DECLARE
  misrouted int;
  homeless int;
  nonowner int;
BEGIN
  SELECT COUNT(*) INTO misrouted FROM users u
   WHERE u.organization_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.user_id = u.id AND m.organization_id = u.organization_id);

  SELECT COUNT(*) INTO homeless FROM users u
   WHERE u.organization_id IS NULL AND EXISTS (SELECT 1 FROM organization_members m WHERE m.user_id = u.id);

  SELECT COUNT(*) INTO nonowner FROM organizations o
   WHERE NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = o.id AND m.role = 'owner')
     AND EXISTS (SELECT 1 FROM organization_members m2 WHERE m2.organization_id = o.id);

  IF misrouted > 0 THEN RAISE EXCEPTION 'misrouted users still exist: %', misrouted; END IF;
  IF homeless > 0 THEN RAISE EXCEPTION 'homeless users still exist: %', homeless; END IF;
  IF nonowner > 0 THEN
    RAISE WARNING 'orgs without owners: % (manual review required; not blocking)', nonowner;
  END IF;
END $$;

COMMIT;
```

### Dry-run first (REQUIRED)

```bash
# 1. Run the audit; save baseline
docker exec infra-postgres-1 psql -U boardupscale -d boardupscale \
  -f /tmp/audit-multi-tenant-state.sql > /tmp/audit-before.txt

# 2. Spin up a temporary DB clone from the snapshot
#    (using pg_restore to a throwaway database)
pg_restore -d boardupscale_dryrun -Fc snapshot_phase_0_5_pre_audit_<ts>.dump

# 3. Run the remediation against the clone
psql -d boardupscale_dryrun -f remediate-multi-tenant-state.sql

# 4. Re-run the audit on the clone; save results
psql -d boardupscale_dryrun -f audit-multi-tenant-state.sql > /tmp/audit-after-dryrun.txt

# 5. Diff the two. Every category should shrink to 0 except category 7
#    (case-duplicate emails, which requires manual merge).
diff /tmp/audit-before.txt /tmp/audit-after-dryrun.txt
```

Only after the dry-run looks correct: run the remediation against production.

---

## Step 3 — Manual follow-ups (if any)

From the audit:
- **Category 7 (case-duplicate emails):** human reviews each pair. Usually pick the row with `password_hash IS NOT NULL` as keeper; reassign any FKs; DELETE the duplicate.
- **"Orgs without owners" warning:** manually promote someone (probably the org's creator if known, else the first-created admin).

Each manual fix is documented in a runbook entry and approved by a second engineer before execution.

---

## Post-deploy audit

Run the full audit script one more time against prod. Expected output:

- Category 1 (role mismatch): 0
- Category 3 (misrouted orgs): 0
- Category 4 (homeless with members): 0
- Category 5 (zombie memberships): 0 (FKs should prevent, but verify)
- Category 6 (dead invites): 0
- Category 7 (orphan tokens): 0
- Category 8 (orphan jira_account_id): 0
- Category 10 (pending_invite_organization_id mismatch): acceptable to have rows (they're the valid cross-org invites we added)
- Category 11 (case duplicates): 0 (after manual merges)
- Category 12 (empty orgs): logged only; cleanup later
- Category 13 (no-owner orgs): 0 (or manually resolved)

---

## Completion criteria

- [ ] Audit report captured before and after remediation
- [ ] Dry-run on DB clone passed invariant checks
- [ ] Production remediation ran inside a transaction and committed
- [ ] Post-remediation audit shows all auto-fixable categories at 0
- [ ] Any manual follow-ups from Category 7/13 resolved
- [ ] Drift audit cron from Phase 0 still reads 0

---

## Rollback

If the transaction fails its invariant check → automatic ROLLBACK, no prod impact.

If the transaction committed but post-audit shows regression:

```bash
# Restore from snapshot_phase_0_5_pre_audit
ssh prod "pg_restore -c -d boardupscale snapshot_phase_0_5_pre_audit_<ts>.dump"
```

The window between commit and rollback may contain real customer writes — restore with WAL archives to preserve them.

---

## Next

Phase 1 — additive schema. Only proceed when this phase's post-audit is 100% clean.
