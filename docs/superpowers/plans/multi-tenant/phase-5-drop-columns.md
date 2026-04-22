# Phase 5 — Drop Legacy Columns

**Goal:** finalize the new shape. Legacy columns stop existing on disk.

**Duration:** 1 day + 24h monitoring window
**Deploys:** 1 (+ snapshot before)
**Prerequisites:** Phase 4 soak complete; drift audit 0 for 7 days; zero `[legacy-access]` warnings in logs for 48h; code sweep confirms no remaining reads of legacy columns.
**Rollback:** restore from `pg_dump` snapshot + redeploy previous commit. Writes in the monitoring window would need to be re-applied from WAL archives (target: monitoring window <24h).

---

## Phase 4.5 — Forced re-auth checkpoint (runs first, same deploy)

Before dropping columns, ensure NO session is holding a JWT that still embeds `users.role` as its authoritative role claim. Do this 1 hour before the drop migration runs:

```sql
-- Invalidate every refresh token — forces users to log in again.
UPDATE refresh_tokens
   SET revoked_at = NOW(),
       revoke_reason = 'multi-tenant-phase-5-cutover'
 WHERE revoked_at IS NULL;
```

Users experience: brief "please sign in again" on their next request. JWTs issued after this point will be purely from the new shape.

Schedule this for a low-traffic window (e.g., 3 AM UTC). Announce to customers via in-app banner 24h in advance.

---

## Pre-flight checklist

- [ ] **DB snapshot #2 taken.** Same procedure as Phase 1. Verify restore on staging. Name this one `snapshot_phase_5_pre_drop_<timestamp>`.
- [ ] WAL archiving enabled and 24h of archives captured (for point-in-time recovery if rollback needed after the snapshot).
- [ ] Grep the entire API codebase for dropped columns — every match must be in a deprecated/removed code path:
  ```bash
  grep -rn "organizationId\|role\|isActive\|invitationStatus\|jiraAccountId\|emailVerificationToken\|emailVerificationExpiry\|pendingInviteOrganizationId" \
    services/api/src/ \
    | grep -i "user" | grep -v spec | grep -v "\.md"
  ```
  Every hit is either legacy-path-behind-flag (fine, flag now removable) or a bug. Fix bugs first.
- [ ] Frontend code: similarly sweep `services/web/src` for any reference to `user.organizationId`, `user.role`, `user.isActive`, `user.invitationStatus`, `user.jiraAccountId`. All must now read from `/me/memberships`.
- [ ] Drift audit passing for 7 consecutive days
- [ ] Staging: run the same migration and verify everything works
- [ ] Plan a deploy window with on-call present

---

## Migration file

**`services/api/src/database/migrations/1744800000000-MultiTenantPhase5.ts`**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-Tenant Architecture — Phase 5 (drop legacy columns)
 *
 * This is the irreversible-in-forward-direction migration. Running up()
 * makes organization_members + invitations the ONLY source of truth for
 * membership, role, and invitation state.
 *
 * down() adds the columns back but the data is gone — it can only be
 * repopulated from organization_members (which is lossy for anything
 * that was in users.X but not reflected in m.X).
 */
export class MultiTenantPhase51744800000000 implements MigrationInterface {
  name = 'MultiTenantPhase51744800000000';

  public async up(q: QueryRunner): Promise<void> {
    // ── Final safety check (fail the migration if drift exists) ───────
    const [{ drift_count }] = await q.query<{ drift_count: string }[]>(`
      SELECT COUNT(*)::text AS drift_count
        FROM organization_members m
        JOIN users u ON u.id = m.user_id
       WHERE u.organization_id = m.organization_id
         AND (u.role IS DISTINCT FROM m.role OR u.is_active IS DISTINCT FROM m.is_active)
    `);
    if (Number(drift_count) > 0) {
      throw new Error(
        `[Phase5] Drift audit failed — ${drift_count} rows still differ. Aborting drop.`,
      );
    }

    // ── Drop indexes first (they reference the columns) ──────────────
    await q.query(`DROP INDEX IF EXISTS "IDX_users_org_invitation_status"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_users_jira_account_id"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_users_pending_invite_org"`);
    await q.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "ck_users_invitation_status"`);
    await q.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "FK_users_pending_invite_org"`);

    // ── Drop the columns ──────────────────────────────────────────────
    await q.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS organization_id,
        DROP COLUMN IF EXISTS role,
        DROP COLUMN IF EXISTS is_active,
        DROP COLUMN IF EXISTS invitation_status,
        DROP COLUMN IF EXISTS jira_account_id,
        DROP COLUMN IF EXISTS email_verification_token,
        DROP COLUMN IF EXISTS email_verification_expiry,
        DROP COLUMN IF EXISTS pending_invite_organization_id
    `);

    // ── Post-check: row count unchanged ──────────────────────────────
    const [{ users_count }] = await q.query<{ users_count: string }[]>(`SELECT COUNT(*)::text AS users_count FROM users`);
    console.log(`[Phase5] users row count post-drop: ${users_count}`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Restore columns. Data must be rehydrated from organization_members
    // where possible. Lossy — any user with NO membership row can't be
    // restored here.
    await q.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS organization_id uuid,
        ADD COLUMN IF NOT EXISTS role varchar(50) NOT NULL DEFAULT 'member',
        ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS invitation_status varchar(20) NOT NULL DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS jira_account_id varchar(255),
        ADD COLUMN IF NOT EXISTS email_verification_token varchar(255),
        ADD COLUMN IF NOT EXISTS email_verification_expiry timestamptz,
        ADD COLUMN IF NOT EXISTS pending_invite_organization_id uuid
    `);

    // Best-effort rehydration from default memberships
    await q.query(`
      UPDATE users u
         SET organization_id = m.organization_id,
             role            = m.role,
             is_active       = m.is_active
        FROM organization_members m
       WHERE m.user_id = u.id AND m.is_default = true
    `);

    await q.query(`
      UPDATE users u
         SET jira_account_id = m.jira_account_id
        FROM organization_members m
       WHERE m.user_id = u.id
         AND m.is_default = true
         AND m.jira_account_id IS NOT NULL
    `);

    // Pending invites from invitations table
    await q.query(`
      UPDATE users u
         SET invitation_status = 'pending',
             email_verification_token = i.token_hash,
             email_verification_expiry = i.expires_at,
             pending_invite_organization_id = i.organization_id
        FROM invitations i
       WHERE i.email = u.email AND i.status = 'pending'
    `);

    // Re-create indexes
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_users_org_invitation_status" ON users (organization_id, invitation_status)`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_jira_account_id" ON users (jira_account_id) WHERE jira_account_id IS NOT NULL`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_users_pending_invite_org" ON users (pending_invite_organization_id) WHERE pending_invite_organization_id IS NOT NULL`);
  }
}
```

---

## Entity updates

Strip the dropped columns from `User` entity:

**`services/api/src/modules/users/entities/user.entity.ts`** — remove:
- `organizationId`
- `role`
- `isActive`
- `invitationStatus`
- `jiraAccountId`
- `emailVerificationToken`
- `emailVerificationExpiry`
- `pendingInviteOrganizationId`

Keep: id, email, passwordHash, displayName, avatarUrl, timezone, language, emailVerified, oauth*, twoFa*, lastLoginAt, failedLoginAttempts, lockedUntil, deletedAt, createdAt, updatedAt.

Update `services/api/src/modules/users/users.service.ts`:

- Drop `findByEmailVerificationToken` entirely — no longer used. Any caller should have been migrated to `invitationsService.findByRawToken` in Phase 3c.
- `activateInvitedUser` now takes no invitation-state params; it just sets `password_hash`, `display_name`, `email_verified=true`.

Remove all the flag-gated legacy branches from:
- `auth.service.ts`
- `organizations.service.ts`
- `permissions.service.ts`
- `organization-members.service.ts`
- Jira migration worker
- Anywhere else grep turned up

The flags themselves stay in config for one more phase — Phase 6 removes them.

---

## Frontend updates

Any remaining references to `user.organizationId`, `user.role`, etc. must be purged. Use `useMe()` (identity) and `useMyMemberships()` (list) as the two sources.

Sweep:

```bash
grep -rn "\.organizationId\|\.role\s\|\.isActive\|\.invitationStatus\|\.jiraAccountId" services/web/src | grep -v "\.test\.\|\.spec\." | grep -i "user"
```

Every hit is a bug — fix before merging this phase.

---

## Deployment procedure

1. Confirm pre-flight checklist is fully green.
2. Schedule a 2-hour window with on-call present (even though migration is fast, the drop is irreversible-ish).
3. **Take snapshot #2:** `pg_dump -Fc -Z9 prod > snapshot_phase_5_pre_drop_$(date +%F_%H%M).dump`
4. Copy off-host (S3, or the operator's laptop — somewhere not on the prod server).
5. Verify the dump file size looks reasonable (not empty, not truncated).
6. Deploy the commit: TypeORM runs the migration, API restarts with the stripped entity.
7. Tail the deploy log; confirm migration logged `users row count post-drop: <N>` matches the pre-drop baseline.
8. Post-deploy audit queries (below).
9. 24h monitoring with extra alerting sensitivity.

---

## Post-deploy audit

```sql
-- A. Row count parity
SELECT COUNT(*) FROM users;
-- Must match the baseline recorded in Phase 1's pre-flight.

-- B. Legacy columns are gone
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'users'
   AND column_name IN ('organization_id','role','is_active','invitation_status','jira_account_id','email_verification_token','email_verification_expiry','pending_invite_organization_id');
-- = 0 rows

-- C. FK refs still valid
SELECT COUNT(*) FROM issues i LEFT JOIN users u ON u.id = i.reporter_id WHERE u.id IS NULL;
SELECT COUNT(*) FROM organization_members m LEFT JOIN users u ON u.id = m.user_id WHERE u.id IS NULL;
-- Both = 0

-- D. Every active session's membership still resolves
SELECT COUNT(*) FROM refresh_tokens r
 WHERE r.revoked_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM organization_members m WHERE m.user_id = r.user_id AND m.is_active = true
   );
-- Should be small; investigate any large number (users with active refresh tokens but no active memberships shouldn't exist after Phase 3f).
```

Run the drift audit one final time:

```bash
curl -H "Authorization: Bearer $ADMIN_JWT" https://app.boardupscale.com/api/admin/audit/multi-tenant-drift
# totalDrift: 0
```

The drift service from Phase 0/2 needs its Invariant C query updated — legacy `users.role` etc. no longer exist. Either remove those checks or have them return 0 when the columns are absent (recommended):

```typescript
// In MultiTenantDriftService.check():
const hasLegacyRole = await this.ds.query(
  `SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role'`,
).then((r) => r.length > 0);

if (hasLegacyRole) {
  await run('drift.role_mismatch', ...);
} // else skip — legacy dropped
```

---

## Monitoring window (24h)

- API error rate: alert on >0.1% regression from 24h-baseline
- Support inbox: escalate any ticket mentioning login / workspace / invite
- On-call available for immediate rollback

If nothing bad happens in 24h, Phase 5 is done. Proceed to Phase 6.

---

## Completion criteria

- [ ] Migration ran successfully, row counts unchanged
- [ ] All legacy column grep hits are gone (API + web)
- [ ] Drift audit endpoint returns 0
- [ ] 24h monitoring window clean
- [ ] No support tickets
- [ ] Staging remains stable

---

## Rollback

**Hard rollback only.** If the 24h window reveals something broken:

```bash
# 1. Put API in maintenance mode
ssh prod "docker exec infra-nginx ..."  # enable maintenance page

# 2. Restore from snapshot
ssh prod "pg_restore -c -d boardupscale snapshot_phase_5_pre_drop_<ts>.dump"

# 3. Apply WAL archives since snapshot (if any customer writes in the 24h window need preserving)
#    — use point-in-time recovery if the DB supports it in your setup.

# 4. Redeploy the commit prior to Phase 5 (Phase 4's commit)
ssh prod "cd /home/ubuntu/infra && IMAGE_TAG=<phase-4-sha> docker compose up -d"

# 5. Re-enable dual-write legacy + new
ssh prod "sed -i 's/DUAL_WRITE_LEGACY_SHAPE=.*/DUAL_WRITE_LEGACY_SHAPE=true/' /home/ubuntu/infra/.env"
ssh prod "docker compose up -d bu-api bu-worker"

# 6. Exit maintenance
```

After rollback, identify the regression, fix it, re-soak Phase 4, retry Phase 5.

---

## Next

Phase 6 — post-work. Cron jobs, observability polish, docs.
