# Phase 1 — Additive Schema + Backfill

**Goal:** create the target shape alongside the old. Old code paths continue to work untouched; new columns/tables are populated but not yet read.

**Duration:** 1 day of engineering, plus ≥24h staging soak
**Deploys:** 1
**Prerequisites:** Phase 0 complete; drift audit showing `totalDrift=0` hourly for ≥3 days.
**Rollback:** migration `down()` drops the new objects. Data in old columns unchanged.

---

## Pre-flight checklist

- [ ] **DB snapshot taken.** `pg_dump -Fc` to a named file; copied off-host; verified restore on staging.
- [ ] Drift audit `totalDrift=0` in production.
- [ ] Row count baseline recorded (append to runbook):
  ```sql
  SELECT 'users' t, COUNT(*) FROM users
  UNION ALL SELECT 'organization_members', COUNT(*) FROM organization_members
  UNION ALL SELECT 'organizations', COUNT(*) FROM organizations
  UNION ALL SELECT 'issues', COUNT(*) FROM issues
  UNION ALL SELECT 'comments', COUNT(*) FROM comments
  UNION ALL SELECT 'attachments', COUNT(*) FROM attachments;
  ```
- [ ] `pg_trgm` / `citext` extension availability confirmed: `SELECT * FROM pg_available_extensions WHERE name IN ('citext');` returns a row.
- [ ] Zero active Jira migrations (`SELECT COUNT(*) FROM jira_migration_runs WHERE status='processing'` returns 0). Hold the migration if one is in-flight.

---

## Migration file

**`services/api/src/database/migrations/1744700000000-MultiTenantPhase1.ts`**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-Tenant Architecture — Phase 1 (additive only)
 *
 * Creates the target shape alongside the existing one. No old columns
 * touched. All new columns are populated by a backfill at the end of up().
 *
 * After this migration:
 *   - organization_members gains: is_active, is_default(backfilled), jira_account_id,
 *     invited_by, deactivated_at, last_active_at, version
 *   - users gains: deleted_at
 *   - New table: invitations
 *   - users.email becomes CITEXT (case-insensitive equality, no index rebuild cost
 *     because we recreate the unique index as part of the same transaction)
 */
export class MultiTenantPhase11744700000000 implements MigrationInterface {
  name = 'MultiTenantPhase11744700000000';

  public async up(q: QueryRunner): Promise<void> {
    // ── 1. citext extension + email column ────────────────────────────
    await q.query(`CREATE EXTENSION IF NOT EXISTS citext`);

    // Save current row count for post-migration sanity check
    const [{ users_count }] = await q.query<{ users_count: string }[]>(
      `SELECT COUNT(*)::text AS users_count FROM users`,
    );

    // Convert email to citext. Drop the old unique index first so the type
    // change doesn't require a table rewrite, then recreate.
    await q.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "UQ_users_email"`);
    await q.query(`ALTER TABLE users ALTER COLUMN email TYPE citext`);
    await q.query(`ALTER TABLE users ADD CONSTRAINT "UQ_users_email" UNIQUE (email)`);

    // ── 2. users additions ─────────────────────────────────────────────
    await q.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at) WHERE deleted_at IS NOT NULL`);

    // ── 3. organization_members additions ──────────────────────────────
    await q.query(`
      ALTER TABLE organization_members
        ADD COLUMN IF NOT EXISTS is_active        boolean     NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS jira_account_id  varchar(255),
        ADD COLUMN IF NOT EXISTS invited_by       uuid,
        ADD COLUMN IF NOT EXISTS deactivated_at   timestamptz,
        ADD COLUMN IF NOT EXISTS last_active_at   timestamptz,
        ADD COLUMN IF NOT EXISTS version          bigint      NOT NULL DEFAULT 1
    `);
    await q.query(`
      ALTER TABLE organization_members
        ADD CONSTRAINT fk_org_members_invited_by FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_org_members_org_active
        ON organization_members (organization_id, is_active)
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_org_members_org_role
        ON organization_members (organization_id, role)
    `);
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_org_members_org_jira_account
        ON organization_members (organization_id, jira_account_id)
        WHERE jira_account_id IS NOT NULL
    `);
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_org_members_user_default
        ON organization_members (user_id) WHERE is_default = true
    `);

    // ── 4. invitations table ───────────────────────────────────────────
    await q.query(`
      CREATE TABLE IF NOT EXISTS invitations (
        id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        email              citext      NOT NULL,
        role               varchar(50) NOT NULL DEFAULT 'member'
                           CHECK (role IN ('owner','admin','manager','member','viewer')),
        token_hash         char(64)    NOT NULL UNIQUE,
        status             varchar(20) NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','accepted','revoked','expired')),
        invited_by         uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        invited_at         timestamptz NOT NULL DEFAULT NOW(),
        expires_at         timestamptz NOT NULL,
        accepted_at        timestamptz,
        accepted_user_id   uuid        REFERENCES users(id) ON DELETE SET NULL,
        revoked_at         timestamptz,
        revoked_by         uuid        REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_invitations_pending_per_org
        ON invitations (organization_id, email) WHERE status = 'pending'
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_invitations_email_pending
        ON invitations (email) WHERE status = 'pending'
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_invitations_org_status
        ON invitations (organization_id, status)
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_invitations_expires_at
        ON invitations (expires_at) WHERE status = 'pending'
    `);

    // ── 5. Backfill organization_members.is_active from users.is_active ──
    await q.query(`
      UPDATE organization_members m
         SET is_active = u.is_active
        FROM users u
       WHERE m.user_id = u.id
         AND u.is_active IS NOT NULL
    `);

    // ── 6. Backfill organization_members.jira_account_id from users.jira_account_id ──
    // Only for the user's legacy home org — other orgs keep NULL until explicit import.
    await q.query(`
      UPDATE organization_members m
         SET jira_account_id = u.jira_account_id
        FROM users u
       WHERE m.user_id = u.id
         AND m.organization_id = u.organization_id
         AND u.jira_account_id IS NOT NULL
    `);

    // ── 7. Backfill is_default: the membership matching users.organization_id ──
    await q.query(`
      UPDATE organization_members
         SET is_default = false
       WHERE is_default = true
    `);
    await q.query(`
      UPDATE organization_members m
         SET is_default = true
        FROM users u
       WHERE m.user_id = u.id
         AND m.organization_id = u.organization_id
         AND u.organization_id IS NOT NULL
    `);
    // Any user without a legacy organization_id pointer but with memberships
    // gets their oldest membership marked default (deterministic).
    await q.query(`
      UPDATE organization_members m
         SET is_default = true
       WHERE m.user_id IN (
         SELECT user_id FROM organization_members
          GROUP BY user_id
         HAVING BOOL_AND(is_default = false)
       )
         AND (m.user_id, m.created_at) IN (
           SELECT user_id, MIN(created_at) FROM organization_members
             GROUP BY user_id
         )
    `);

    // ── 8. Migrate pending legacy invites into invitations table ─────────
    // Users with a token + pending_invite_organization_id become invitations rows.
    // Users with a token but no target org are abandoned (data quality issue — log them).
    await q.query(`
      INSERT INTO invitations
        (organization_id, email, token_hash, status, invited_by, invited_at, expires_at)
      SELECT
        u.pending_invite_organization_id,
        u.email,
        u.email_verification_token,
        'pending',
        COALESCE(
          (SELECT id FROM users WHERE role IN ('owner','admin') AND organization_id = u.pending_invite_organization_id ORDER BY created_at LIMIT 1),
          (SELECT id FROM users ORDER BY created_at LIMIT 1)
        ),
        COALESCE(u.updated_at, NOW()),
        COALESCE(u.email_verification_expiry, NOW() + INTERVAL '7 days')
      FROM users u
      WHERE u.invitation_status = 'pending'
        AND u.email_verification_token IS NOT NULL
        AND u.pending_invite_organization_id IS NOT NULL
      ON CONFLICT DO NOTHING
    `);

    // ── 9. Sanity check ──────────────────────────────────────────────────
    const [{ users_after }] = await q.query<{ users_after: string }[]>(
      `SELECT COUNT(*)::text AS users_after FROM users`,
    );
    if (users_after !== users_count) {
      throw new Error(
        `[Phase1] user row count changed during migration: ${users_count} → ${users_after}`,
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    // Drop new objects. Old columns unchanged.
    await q.query(`DROP TABLE IF EXISTS invitations`);

    await q.query(`DROP INDEX IF EXISTS uq_org_members_user_default`);
    await q.query(`DROP INDEX IF EXISTS uq_org_members_org_jira_account`);
    await q.query(`DROP INDEX IF EXISTS idx_org_members_org_role`);
    await q.query(`DROP INDEX IF EXISTS idx_org_members_org_active`);
    await q.query(`ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS fk_org_members_invited_by`);
    await q.query(`
      ALTER TABLE organization_members
        DROP COLUMN IF EXISTS version,
        DROP COLUMN IF EXISTS last_active_at,
        DROP COLUMN IF EXISTS deactivated_at,
        DROP COLUMN IF EXISTS invited_by,
        DROP COLUMN IF EXISTS jira_account_id,
        DROP COLUMN IF EXISTS is_active
    `);

    await q.query(`DROP INDEX IF EXISTS idx_users_deleted_at`);
    await q.query(`ALTER TABLE users DROP COLUMN IF EXISTS deleted_at`);

    // Leave email as citext — reverting to varchar requires a table rewrite
    // and no consumer cares about the distinction. If strict rollback needed:
    //   ALTER TABLE users ALTER COLUMN email TYPE varchar(255);
  }
}
```

---

## Entity updates (additive only — these add fields, don't remove anything)

### `services/api/src/modules/organizations/entities/organization-member.entity.ts`

Add:

```typescript
@Column({ name: 'is_active', type: 'boolean', default: true })
isActive: boolean;

@Column({ name: 'jira_account_id', type: 'varchar', length: 255, nullable: true })
jiraAccountId: string | null;

@Column({ name: 'invited_by', type: 'uuid', nullable: true })
invitedBy: string | null;

@Column({ name: 'deactivated_at', type: 'timestamptz', nullable: true })
deactivatedAt: Date | null;

@Column({ name: 'last_active_at', type: 'timestamptz', nullable: true })
lastActiveAt: Date | null;

@Column({ name: 'version', type: 'bigint', default: 1 })
version: number;
```

### `services/api/src/modules/users/entities/user.entity.ts`

Add:

```typescript
@Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
deletedAt: Date | null;
```

### New entity: `services/api/src/modules/invitations/entities/invitation.entity.ts`

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

@Entity('invitations')
@Index(['organizationId', 'email'], { unique: true, where: `status = 'pending'` })
@Index(['organizationId', 'status'])
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar' })
  email: string;

  @Column({ type: 'varchar', length: 50, default: 'member' })
  role: string;

  @Column({ name: 'token_hash', type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: 'pending' | 'accepted' | 'revoked' | 'expired';

  @Column({ name: 'invited_by', type: 'uuid' })
  invitedBy: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'invited_by' })
  inviter: User;

  @Column({ name: 'invited_at', type: 'timestamptz' })
  invitedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'accepted_user_id', type: 'uuid', nullable: true })
  acceptedUserId: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy: string | null;
}
```

### `services/api/src/modules/invitations/invitations.module.ts` (new)

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invitation } from './entities/invitation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Invitation])],
  exports: [TypeOrmModule],
})
export class InvitationsModule {}
```

Add to `app.module.ts` imports.

---

## Tests

**`services/api/src/database/migrations/1744700000000-MultiTenantPhase1.spec.ts`** (new)

Integration test that:
- Runs migration on a freshly seeded DB (1 org, 3 users, 2 memberships, 1 pending invite)
- Asserts: `invitations` row exists for the pending invite with correct org and token
- Asserts: one of the memberships is `is_default=true`
- Asserts: `user_count_before == user_count_after`
- Asserts: Invariant B (FK orphans) still 0
- Asserts: Invariant E (single default per user) satisfied
- Runs the `down()` and confirms the new objects are gone

---

## Post-deploy audit queries

Run immediately after deploy completes. All must return 0 / expected values.

```sql
-- A. Row counts unchanged
SELECT 'users' t, COUNT(*) FROM users
UNION ALL SELECT 'organization_members', COUNT(*) FROM organization_members
UNION ALL SELECT 'organizations', COUNT(*) FROM organizations
UNION ALL SELECT 'issues', COUNT(*) FROM issues;
-- Compare to baseline — must be identical.

-- B. No FK orphans
SELECT COUNT(*) FROM issues i LEFT JOIN users u ON u.id = i.reporter_id WHERE u.id IS NULL;
-- = 0

-- C. Every user has at most one default membership
SELECT COUNT(*) FROM (
  SELECT user_id FROM organization_members WHERE is_default = true
  GROUP BY user_id HAVING COUNT(*) > 1
) x;
-- = 0

-- D. Every pending legacy invite has an invitations row
SELECT COUNT(*) FROM users u
 WHERE u.invitation_status = 'pending'
   AND u.email_verification_token IS NOT NULL
   AND u.pending_invite_organization_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM invitations i
       WHERE i.organization_id = u.pending_invite_organization_id
         AND i.email = u.email
         AND i.status = 'pending'
   );
-- = 0

-- E. organization_members.is_active backfilled from users.is_active
SELECT COUNT(*) FROM organization_members m
  JOIN users u ON u.id = m.user_id
 WHERE u.organization_id = m.organization_id
   AND u.is_active IS DISTINCT FROM m.is_active;
-- = 0

-- F. jira_account_id correctly placed on membership for home org
SELECT COUNT(*) FROM users u
  JOIN organization_members m
    ON m.user_id = u.id AND m.organization_id = u.organization_id
 WHERE u.jira_account_id IS NOT NULL
   AND u.jira_account_id IS DISTINCT FROM m.jira_account_id;
-- = 0
```

---

## Completion criteria

- [ ] Migration ran successfully in prod; deploy log clean
- [ ] All 6 post-deploy audit queries return 0 or expected values
- [ ] Drift audit cron from Phase 0 still returns `totalDrift=0`
- [ ] No error-rate regression (<0.1%)
- [ ] Staging soak ≥ 24h
- [ ] Runbook updated with baseline row counts

---

## Rollback

If the post-deploy audit fails:

```bash
# 1. Revert via TypeORM migration down
docker exec infra-bu-api-1 node ./node_modules/typeorm/cli.js \
  migration:revert -d dist/src/database/data-source.js

# 2. If that fails (bug in down()), restore from snapshot:
#    Stop writes (put API in maintenance mode), restore pg_dump file,
#    redeploy previous commit.
```

After rollback, re-run audit queries to confirm state matches pre-migration baseline.

---

## Next

Phase 2 — dual-write. Do not start until audit is green for ≥24h.
