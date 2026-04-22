# Phase 2 — Dual-Write

**Goal:** every write that touches migrated state writes to BOTH the legacy columns and the new ones. Reads still use legacy. An hourly drift audit verifies they stay in sync.

**Duration:** 3 days of engineering + ≥48h staging soak
**Deploys:** 1 (+ feature flag rollouts)
**Prerequisites:** Phase 1 complete; all six Phase 1 audit queries returning expected values; drift cron green for 24h.
**Rollback:** `DUAL_WRITE_NEW_SHAPE=false` env flag → instant cutover back to legacy-only writes. New-shape data stops updating; old-shape data stays correct.

---

## Pre-flight checklist

- [ ] All Phase 1 entities exported and wired into `app.module.ts`
- [ ] `InvitationsModule` imported where needed (auth, organizations)
- [ ] Feature-flag infrastructure present: add `DUAL_WRITE_NEW_SHAPE=true` to `.env.example` and prod env
- [ ] Prod drift audit returns 0 for ≥24h

---

## Feature flag

`services/api/src/config/configuration.ts`:

```typescript
featureFlags: {
  dualWriteNewShape: process.env.DUAL_WRITE_NEW_SHAPE !== 'false',   // default ON in Phase 2
  dualWriteLegacyShape: process.env.DUAL_WRITE_LEGACY_SHAPE !== 'false', // stays ON until Phase 4
  readFromNewShape: {
    rbac:         process.env.READ_NEW_RBAC === 'true',
    getMembers:   process.env.READ_NEW_GET_MEMBERS === 'true',
    invitations:  process.env.READ_NEW_INVITATIONS === 'true',
    inviteEmail:  process.env.READ_NEW_INVITE_EMAIL === 'true',
    jiraMigration:process.env.READ_NEW_JIRA === 'true',
    deactivation: process.env.READ_NEW_DEACTIVATION === 'true',
    jwtClaims:    process.env.READ_NEW_JWT === 'true',
    meEndpoint:   process.env.READ_NEW_ME === 'true',
    auditLogs:    process.env.READ_NEW_AUDIT === 'true',
  },
}
```

Worker mirrors (only dualWrite flags, no read flags):

`services/worker/src/config.ts`:

```typescript
dualWriteNewShape: process.env.DUAL_WRITE_NEW_SHAPE !== 'false',
dualWriteLegacyShape: process.env.DUAL_WRITE_LEGACY_SHAPE !== 'false',
```

All Phase-2 changes read these flags and no-op the new-shape write when disabled.

---

## Call sites to update — exhaustive list

Every write that mutates `users.role`, `users.is_active`, `users.invitation_status`, `users.jira_account_id`, `users.email_verification_token`, `users.email_verification_expiry`, or `users.pending_invite_organization_id`.

### 2.1 `services/api/src/modules/auth/auth.service.ts`

| Method | Legacy write | New write |
|---|---|---|
| `register(dto)` | `users.role='owner'`, `users.is_active=true`, `users.organization_id=newOrg` | Create `organization_members(role='owner', is_active=true, is_default=true)` — already done. |
| `acceptInvitation(...)` | `users.password_hash`, `users.is_active=true`, `users.invitation_status='accepted'`, clears `users.email_verification_token` | Also: update `invitations` row → `status='accepted', accepted_at=NOW(), accepted_user_id`. Update `organization_members.is_active=true, version=version+1` for the invited org. |
| `verifyEmail(token)` | `users.email_verified=true`, clears `email_verification_token` | If the user has any matching `invitations` rows (token may overlap with legacy system in transition), DO NOT consume those — the invitation flow is distinct from email-verification. Leave invitations untouched. |

### 2.2 `services/api/src/modules/organizations/organizations.service.ts`

| Method | Legacy write | New write |
|---|---|---|
| `inviteMember(orgId, dto, inviterId)` — new-email branch | `users.email_verification_token`, `expiry`, `invitation_status='pending'`, `pending_invite_organization_id` | Additionally INSERT `invitations(organization_id, email, token_hash, invited_by, expires_at)`. If `UniqueViolation` (pending row exists): 409. |
| `inviteMember` — existing-active-user branch | Insert `organization_members` for new org | Unchanged (already writes membership). |
| `inviteMember` — existing-pending-user branch | Overwrites `users.email_verification_token` | ALSO upsert `invitations` row for the target org (409 if pending row already exists with a different token). |
| `updateMemberRole(orgId, userId, newRole, ...)` | `users.role = newRole` (conditional on home org match) | Additionally `UPDATE organization_members SET role=$1, version=version+1 WHERE user_id=$2 AND organization_id=$3` — already done in the hotfix; verify flag-gated. |
| `updateMemberInfo(...)` | `users.display_name`, `users.avatar_url` | No membership-side write — these are identity fields. (Verify hotfix did this correctly.) |
| `deactivateMember(orgId, userId, ...)` | `users.is_active=false` (conditional) | `UPDATE organization_members SET is_active=false, deactivated_at=NOW(), version=version+1 WHERE user_id=$1 AND organization_id=$2` — add if missing. |
| `resendInvitation(orgId, userId, ...)` | New token on `users` | ALSO regenerate token on the matching `invitations` row; update `expires_at`. If no row: create one. |
| `revokeInvitation(...)` | Currently deletes `organization_members` or soft-revokes user | ALSO `UPDATE invitations SET status='revoked', revoked_at, revoked_by WHERE organization_id=$1 AND email=$2 AND status='pending'`. |
| `updateMigratedMemberEmail(...)` | Updates `users.email`, resets invitation state | ALSO create fresh `invitations` row for the new email (old one gets revoked). |
| `bulkInvitePending(...)` | Sends invites to any `users` with `invitation_status='pending'` | Same flow as `inviteMember` for each; creates `invitations` rows en masse. |
| `generateAndSendInvitation(user, inviterId, orgId)` (private helper) | Writes token + expiry + status + pending_invite_organization_id | Upsert `invitations`. |

### 2.3 `services/api/src/modules/users/users.service.ts`

| Method | Change |
|---|---|
| `activateInvitedUser(userId, passwordHash, displayName)` | Add: accept the matching `invitations` row. |
| `findByEmailVerificationToken(tokenHash)` | Leave as-is (legacy only; Phase 3 introduces `invitations.findByTokenHash`). |

### 2.4 `services/api/src/modules/organizations/organization-members.service.ts`

| Method | Change |
|---|---|
| `addMembership(orgId, userId, role, isDefault)` | Verify it sets `is_active=true, version=1` defaults. Add if missing. |

### 2.5 Jira migration worker

**`services/worker/src/migration/jira-migration.processor.ts` — Phase 1 `runMembersPhase`:**

- Current: writes `users.jira_account_id` in the bulk upsert.
- Phase 2 change: ADDITIONALLY, after the `organization_members` dual-write (already there), backfill `organization_members.jira_account_id` for this org's rows:

```typescript
// After the existing organization_members upsert:
if (config.dualWriteNewShape) {
  await client.query(
    `UPDATE organization_members m
        SET jira_account_id = u.jira_account_id,
            version = version + 1
       FROM users u
      WHERE u.id = m.user_id
        AND m.organization_id = $1
        AND u.jira_account_id = ANY($2::text[])
        AND m.jira_account_id IS DISTINCT FROM u.jira_account_id`,
    [state.organizationId, chunkAccountIds],
  );
}
```

---

## Shared helper — invitations service

Create `services/api/src/modules/invitations/invitations.service.ts` with every write-path method. All org/auth services use it; the direct-SQL writes get replaced in Phase 3.

```typescript
import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Invitation } from './entities/invitation.entity';
import * as crypto from 'crypto';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation) private readonly repo: Repository<Invitation>,
  ) {}

  hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  async create(params: {
    organizationId: string;
    email: string;
    role: string;
    inviterId: string;
    ttlDays?: number;
  }): Promise<{ invitation: Invitation; rawToken: string }> {
    const rawToken = crypto.randomUUID();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + (params.ttlDays ?? 7) * 86400000);

    try {
      const invitation = await this.repo.save(
        this.repo.create({
          organizationId: params.organizationId,
          email: params.email.toLowerCase(),
          role: params.role,
          tokenHash,
          status: 'pending',
          invitedBy: params.inviterId,
          invitedAt: new Date(),
          expiresAt,
        }),
      );
      return { invitation, rawToken };
    } catch (err: any) {
      if (String(err?.message ?? '').includes('uq_invitations_pending_per_org')) {
        throw new ConflictException({
          code: 'INVITE_PENDING',
          message: 'An invitation is already pending for this email in this workspace. Resend or revoke it first.',
        });
      }
      throw err;
    }
  }

  async resend(organizationId: string, email: string, ttlDays = 7): Promise<{ invitation: Invitation; rawToken: string }> {
    const existing = await this.repo.findOne({
      where: { organizationId, email: email.toLowerCase(), status: 'pending' },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'INVITE_NOT_FOUND', message: 'No pending invitation to resend.' });
    }
    const rawToken = crypto.randomUUID();
    existing.tokenHash = this.hashToken(rawToken);
    existing.expiresAt = new Date(Date.now() + ttlDays * 86400000);
    existing.invitedAt = new Date();
    await this.repo.save(existing);
    return { invitation: existing, rawToken };
  }

  async revoke(organizationId: string, email: string, actorId: string): Promise<void> {
    const invite = await this.repo.findOne({
      where: { organizationId, email: email.toLowerCase(), status: 'pending' },
    });
    if (!invite) return; // idempotent — nothing pending is nothing to revoke
    invite.status = 'revoked';
    invite.revokedAt = new Date();
    invite.revokedBy = actorId;
    await this.repo.save(invite);
  }

  async findByRawToken(rawToken: string): Promise<Invitation | null> {
    return this.repo.findOne({ where: { tokenHash: this.hashToken(rawToken) } });
  }

  async accept(invitationId: string, userId: string): Promise<void> {
    await this.repo.update(invitationId, {
      status: 'accepted',
      acceptedAt: new Date(),
      acceptedUserId: userId,
    });
  }

  async markExpired(): Promise<number> {
    const { affected } = await this.repo.update(
      { status: 'pending', expiresAt: LessThan(new Date()) },
      { status: 'expired' },
    );
    return affected ?? 0;
  }
}
```

Register in `InvitationsModule` providers/exports.

---

## Tests

New unit-test file `services/api/src/modules/invitations/invitations.service.spec.ts` — minimum:

- `create() succeeds and returns unhashed raw token exactly once`
- `create() throws 409 on duplicate pending (same org, same email)`
- `resend() updates tokenHash and expiresAt in place`
- `revoke() flips status to 'revoked'`
- `findByRawToken() returns the row; doesn't return revoked/expired`
- `accept() updates status, acceptedAt, acceptedUserId`
- `markExpired() only touches rows past expiresAt and status=pending`

Update **every existing test** in `organizations.service.spec.ts` and `auth.service.spec.ts` that mocks the token/invite columns — add matching `InvitationsService` mock expectations (but keep legacy expectations so tests prove BOTH writes happen during Phase 2).

Drift audit spec from Phase 0 — extend it with Invariants C and D now that the columns/tables exist:

```typescript
it('detects role drift between users and organization_members', async () => { ... });
it('detects invitations drift vs legacy email_verification_token', async () => { ... });
```

---

## Updated drift audit service

`services/api/src/modules/audit/multi-tenant-drift.service.ts` — add Invariants C + D:

```typescript
// Invariant C — role parity
await run(
  'drift.role_mismatch',
  `SELECT COUNT(*)::int AS count FROM organization_members m
     JOIN users u ON u.id = m.user_id
    WHERE u.organization_id = m.organization_id
      AND (u.role IS DISTINCT FROM m.role OR u.is_active IS DISTINCT FROM m.is_active)`,
  `SELECT m.user_id, m.organization_id, u.role legacy_role, m.role new_role,
          u.is_active legacy_active, m.is_active new_active
     FROM organization_members m JOIN users u ON u.id = m.user_id
    WHERE u.organization_id = m.organization_id
      AND (u.role IS DISTINCT FROM m.role OR u.is_active IS DISTINCT FROM m.is_active)
    LIMIT 20`,
);

// Invariant D — invitations drift
await run(
  'drift.pending_invite_missing',
  `SELECT COUNT(*)::int AS count FROM users u
    WHERE u.invitation_status = 'pending'
      AND u.email_verification_token IS NOT NULL
      AND u.pending_invite_organization_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM invitations i
         WHERE i.organization_id = u.pending_invite_organization_id
           AND i.email = u.email
           AND i.status = 'pending'
      )`,
);
```

Mirror the same checks in the worker's `drift-audit.processor.ts`.

Bump cron frequency during Phase 2–4: `REPEAT_EVERY_MS = 60 * 60 * 1000` → `15 * 60 * 1000` (every 15 min).

---

## Post-deploy audit queries

Run immediately after deploy, and watch the 15-min cron for 48h.

```sql
-- Invariants C and D must return 0
-- (queries as in the drift service above)

-- Plus: every invite created since deploy has an invitations row
SELECT COUNT(*) FROM users u
 WHERE u.updated_at > NOW() - INTERVAL '1 hour'
   AND u.invitation_status = 'pending'
   AND NOT EXISTS (
     SELECT 1 FROM invitations i
      WHERE i.organization_id = u.pending_invite_organization_id
        AND i.email = u.email
        AND i.status = 'pending'
   );
-- = 0
```

---

## Completion criteria

- [ ] All call sites updated with dual-write paths
- [ ] `InvitationsService` fully unit-tested (≥6 tests)
- [ ] `MultiTenantDriftService` returns 0 for Invariants A–E
- [ ] Drift cron running every 15 min; green for ≥48h
- [ ] No API error-rate regression
- [ ] Manual smoke test in staging:
  - Invite brand-new email → email received, `invitations` row + legacy `users.token` both present
  - Accept invite → `invitations.status='accepted'` + `users.invitation_status='accepted'` both set
  - Change role in Org X → `organization_members.role` + `users.role` match (if home org)
  - Deactivate → both `is_active` flags flip
  - Same email invited twice to same org → 409 returned from dual-write path

---

## Rollback

```bash
# Set the flag on the prod host
ssh prod "sed -i 's/DUAL_WRITE_NEW_SHAPE=.*/DUAL_WRITE_NEW_SHAPE=false/' /home/ubuntu/infra/.env"
ssh prod "cd /home/ubuntu/infra && docker compose up -d bu-api bu-worker"

# Verify flag in containers
docker exec infra-bu-api-1 env | grep DUAL_WRITE_NEW_SHAPE
```

New-shape data stops updating; old shape still writes correctly. Drift will accumulate from this point on — next phase should re-enable or move forward.

---

## Next

Phase 3 — flip reads. Nine subphases, each an independent PR.
