# Phase 3 — Flip Reads (9 Subphases)

**Goal:** cut every consumer over from reading legacy columns to reading the new shape. Each subphase is one PR with one feature flag. All dual-write from Phase 2 remains ON so a bad flip has a 1-minute rollback.

**Duration:** 1–2 weeks depending on team size
**Deploys:** 9 (one per subphase)
**Prerequisites:** Phase 2 complete; drift returning 0 for ≥48h; all read flags default to `false` in config.
**Rollback:** per-subphase — set the subphase's `READ_NEW_*` flag to `false`, restart api.

---

## Subphase order (v2 — re-ordered for risk)

The order is deliberate — lowest risk first to build confidence in the dual-write plumbing, highest-risk (session-invalidating) last with extra soak.

| # | Name | Flag | Risk | Canary soak | Global soak |
|---|---|---|---|---|---|
| 3a | RBAC guard (remove legacy fallback) | `READ_NEW_RBAC` | Low | 6h | 24h |
| 3b | `getMembers` member list | `READ_NEW_GET_MEMBERS` | Low | 6h | 24h |
| 3c | Invitation validate/accept | `READ_NEW_INVITATIONS` | Medium | 12h | 24h |
| 3d | Invite email org name | `READ_NEW_INVITE_EMAIL` | Low | 6h | 24h |
| 3e | Jira migration `jira_account_id` | `READ_NEW_JIRA` | Medium | 12h | 24h |
| 3f | Deactivation / reactivation | `READ_NEW_DEACTIVATION` | Medium | 12h | 24h |
| 3h | `/me` endpoint split | `READ_NEW_ME` | Low | 6h | 24h |
| 3i | Audit log consumer | `READ_NEW_AUDIT` | Low | 6h | 24h |
| **3g** | **JWT `membership_version`** | **`READ_NEW_JWT`** | **High** | **72h + load test** | **72h** |

### Why 3g is moved to last

3g is the one subphase whose bug blast radius is "every authenticated request" — if it misbehaves, nobody can log in. Moving it last means:

1. All other subphases have already proven the dual-write invariant is holding.
2. The `organization_members.version` column has been receiving writes for weeks via the role-change and deactivation paths (3a, 3f) so its history is real.
3. A failure in 3g can be rolled back without cascading into any other subphase.

Additionally, 3g gets:
- **72h canary soak** (vs 6–12h for others)
- **Mandatory k6 load test** (1000 concurrent sessions) before global flip
- **Grace period**: for the first 24h after global flip, the server accepts JWTs with NO `mv` claim as valid (legacy JWTs issued pre-3g) and silently upgrades them on refresh. After 24h, missing `mv` → 401 forcing re-auth.

Each subphase: open PR → merge → canary flag flip → canary soak → global flag flip → global soak → next subphase. If drift spikes or error rate regresses, flip flag back, investigate.

---

## Subphase 3a — RBAC guard

Already mostly done in the hotfix (`fd91170`). This subphase removes the legacy fallback.

**`services/api/src/modules/permissions/permissions.service.ts`:**

```typescript
// BEFORE
async checkPermission(userId, projectId, resource, action) {
  // 1. Per-org shortcut via membership — added in hotfix
  if (projectOrgId && await this.isOrgAdminOrOwner(userId, projectOrgId)) return true;

  // 2. LEGACY FALLBACK — REMOVE THIS BLOCK when READ_NEW_RBAC=true
  const user = await this.userRepo.findOne({ where: { id: userId } });
  if (user?.role === 'admin' || user?.role === 'owner') return true;

  // 3. Project membership check — unchanged
  ...
}

// AFTER (flag-gated)
async checkPermission(userId, projectId, resource, action) {
  if (projectOrgId && await this.isOrgAdminOrOwner(userId, projectOrgId)) return true;

  if (!this.flags.readFromNewShape.rbac) {
    // Legacy path for rollback safety
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user?.role === 'admin' || user?.role === 'owner') return true;
  }

  ...
}
```

Same pattern in `checkOrgLevelPermission` — remove the legacy role branch when the flag is on.

**Tests:**

- Flag-off path: legacy `users.role` grants still work (for rollback safety)
- Flag-on path: ONLY `organization_members.role` grants access; `users.role` ignored

---

## Subphase 3b — `getMembers`

**`services/api/src/modules/organizations/organizations.service.ts`:**

Under the `READ_NEW_GET_MEMBERS` flag: drop the legacy union; use only `organization_members`:

```typescript
async getMembers(organizationId: string): Promise<User[]> {
  const memberships = await this.organizationMemberRepository.find({
    where: { organizationId },
    relations: ['user'],
    order: { createdAt: 'ASC' },
  });

  const users: User[] = [];
  for (const m of memberships) {
    if (!m.user) continue;
    users.push({ ...m.user, role: m.role, isActive: m.isActive } as User);
  }

  if (!this.flags.readFromNewShape.getMembers) {
    // Keep the legacy union for rollback; skip when flag is on.
    const memberUserIds = new Set(memberships.map((m) => m.userId));
    const legacyUsers = await this.userRepository.find({
      where: { organizationId },
      order: { createdAt: 'ASC' },
    });
    for (const u of legacyUsers) {
      if (!memberUserIds.has(u.id) && u.isActive !== false) users.push(u);
    }
  }

  return users;
}
```

**Tests:**

- With flag on, users that only have `users.organization_id` set (no `organization_members` row) are EXCLUDED — this is the expected behavior, since dual-write from Phase 2 should have created the membership row.
- With flag on, role from `organization_members` is what's returned (verified against both Apr 21 and Apr 22 hotfix tests).

---

## Subphase 3c — Invitation validate/accept

Switch `/auth/validate-invite` and `/auth/accept-invite` to read from `invitations` table.

**`services/api/src/modules/auth/auth.service.ts`:**

```typescript
async validateInvitation(rawToken: string): Promise<{ email: string; organizationName: string }> {
  if (!this.flags.readFromNewShape.invitations) {
    return this.validateInvitation_legacy(rawToken); // keep old implementation
  }

  const invitation = await this.invitationsService.findByRawToken(rawToken);
  if (!invitation) {
    throw new BadRequestException({
      message: 'This invite link is invalid or has already been used.',
      code: 'INVITE_INVALID',
    });
  }

  if (invitation.status === 'accepted') throw new BadRequestException({ message: 'Your account is already active.', code: 'INVITE_ALREADY_ACCEPTED' });
  if (invitation.status === 'revoked') throw new BadRequestException({ message: 'This invitation was revoked.', code: 'INVITE_REVOKED' });
  if (invitation.status === 'expired' || invitation.expiresAt < new Date()) {
    await this.invitationsService.markExpired();
    throw new BadRequestException({ message: 'This invitation has expired. Ask your admin to resend it.', code: 'INVITE_EXPIRED' });
  }

  const org = await this.organizationRepository.findOne({ where: { id: invitation.organizationId } });
  return { email: invitation.email, organizationName: org?.name ?? '' };
}
```

Same pattern for `acceptInvitation`:
- Resolve via `invitationsService.findByRawToken`.
- Create/reuse identity (existing logic).
- Create `organization_members` row for `invitation.organizationId`.
- `invitationsService.accept(invitation.id, user.id)`.
- First-time activation cleanup (already in hotfix) still applies.

---

## Subphase 3d — Invite email org name

`generateAndSendInvitation` uses `invitation.organizationId` as the source of truth:

```typescript
const org = await this.organizationRepository.findOne({
  where: { id: invitation.organizationId },  // from invitationsService.create() result
});
await this.emailService.sendInvitationEmail(
  invitation.email,
  inviter?.displayName ?? 'A team member',
  org?.name ?? 'your organization',
  inviteUrl,
);
```

Behind `READ_NEW_INVITE_EMAIL`; old path reads `users.pending_invite_organization_id`.

---

## Subphase 3e — Jira migration `jira_account_id`

Switch Phase-4/5/6 of the Jira migration (`runIssuesPhase`, `runCommentsPhase`, `runAttachmentsPhase`) to resolve `reporter_id`, `assignee_id`, `author_id`, `uploaded_by` via `organization_members.jira_account_id` instead of `users.jira_account_id`.

**`services/worker/src/migration/jira-migration.processor.ts`:**

Add a helper:

```typescript
async function resolveJiraUser(
  client: PoolClient,
  orgId: string,
  jiraAccountId: string,
  useNewShape: boolean,
): Promise<string | null> {
  if (useNewShape) {
    const { rows } = await client.query<{ user_id: string }>(
      `SELECT user_id FROM organization_members
        WHERE organization_id = $1 AND jira_account_id = $2 LIMIT 1`,
      [orgId, jiraAccountId],
    );
    return rows[0]?.user_id ?? null;
  }
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE jira_account_id = $1 LIMIT 1`,
    [jiraAccountId],
  );
  return rows[0]?.id ?? null;
}
```

Replace every in-phase `state.jiraAccountIdToLocalId[accountId]` lookup with `await resolveJiraUser(...)` when the flag is on. The in-memory map remains a fast path when populated; fall back to DB when empty.

**Test:** run an end-to-end migration twice into two different orgs with overlapping emails. Assert issue attribution resolves per-org correctly.

---

## Subphase 3f — Deactivation / reactivation

Login and request-time checks switch from `users.is_active` to `organization_members.is_active` for the session org.

**`services/api/src/modules/auth/auth.service.ts`:**

```typescript
// In login / LocalStrategy:
const user = await this.usersService.findByEmail(dto.email);
if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');
if (user.deletedAt) throw new UnauthorizedException('Account not found');

if (this.flags.readFromNewShape.deactivation) {
  const memberships = await this.orgMemberRepository.find({
    where: { userId: user.id, isActive: true },
  });
  if (memberships.length === 0) {
    throw new UnauthorizedException({
      message: 'Your account is not active in any workspace.',
      code: 'NO_ACTIVE_WORKSPACE',
    });
  }
}
```

Request-time check (add to `JwtStrategy.validate` or a request-scoped interceptor):

```typescript
if (this.flags.readFromNewShape.deactivation) {
  const membership = await this.orgMemberRepository.findOne({
    where: { userId: payload.sub, organizationId: payload.organizationId },
  });
  if (!membership || !membership.isActive) {
    throw new UnauthorizedException({
      message: 'Workspace access revoked.',
      code: 'MEMBERSHIP_REVOKED',
    });
  }
}
```

---

## Subphase 3g — JWT `membership_version` (HIGH RISK)

**Canary soak: 72h. Load test MANDATORY before global flip.**

Add `mv` claim to the JWT; compare against DB on every request. See above for why this is the final and most sensitive subphase.

### Grace period for legacy tokens

During the first 24h after global flip, the server MUST accept JWTs with no `mv` claim (tokens issued before this subphase). The JWT strategy upgrades them transparently on the next request.

```typescript
// JWT strategy.validate with grace handling:
if (payload.mv === undefined) {
  // Legacy token issued pre-3g. Upgrade by re-reading membership.
  // Do NOT reject — the user had a valid session before this subphase.
  const membership = await this.orgMemberRepository.findOne({
    where: { userId: payload.sub, organizationId: payload.organizationId },
  });
  if (!membership?.isActive) throw new UnauthorizedException({ code: 'MEMBERSHIP_REVOKED' });
  // Optionally: trigger a silent refresh so the next JWT has mv
  return { id: payload.sub, email: payload.email, organizationId: payload.organizationId, role: membership.role };
}

// After the grace window (24h), add the mv enforcement:
if (Number(membership.version) !== Number(payload.mv)) {
  throw new UnauthorizedException({ code: 'SESSION_STALE' });
}
```

The 24h grace is controlled by a timestamp in the config:

```typescript
flags: {
  jwtMvEnforcementStartsAt: process.env.JWT_MV_ENFORCEMENT_STARTS_AT,  // ISO timestamp
}
```

Operator sets this to `now + 24h` at the moment of global flip. Before the timestamp: grace mode. After: strict mode. This gives us a clean, auditable window.

**`services/api/src/modules/auth/auth.service.ts` (generateTokens):**

```typescript
async generateTokens(user: User, ipAddress?: string, userAgent?: string, organizationId?: string) {
  const orgId = organizationId ?? user.organizationId; // legacy fallback
  let mv = 1;
  if (this.flags.readFromNewShape.jwtClaims && orgId) {
    const membership = await this.orgMemberRepository.findOne({
      where: { userId: user.id, organizationId: orgId },
      select: ['version'],
    });
    mv = Number(membership?.version ?? 1);
  }

  const payload = {
    sub: user.id,
    email: user.email,
    organizationId: orgId,
    role: user.role, // legacy; dropped in Phase 4
    mv,              // NEW
  };
  ...
}
```

**JWT strategy:**

```typescript
async validate(payload: JwtPayload) {
  if (this.flags.readFromNewShape.jwtClaims && payload.mv !== undefined) {
    const membership = await this.orgMemberRepository.findOne({
      where: { userId: payload.sub, organizationId: payload.organizationId },
      select: ['version', 'role', 'isActive'],
    });
    if (!membership || !membership.isActive) {
      throw new UnauthorizedException({ code: 'MEMBERSHIP_REVOKED' });
    }
    if (Number(membership.version) !== Number(payload.mv)) {
      throw new UnauthorizedException({ code: 'SESSION_STALE', message: 'Session expired, please re-auth.' });
    }
    return {
      id: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
      role: membership.role, // per-org role, not legacy global
    };
  }

  // Legacy path
  return {
    id: payload.sub,
    email: payload.email,
    organizationId: payload.organizationId,
    role: payload.role,
  };
}
```

**Version bump:** any UPDATE on `organization_members.role` or `is_active` includes `version = version + 1`. Done in Phase 2 for dual-write.

**Frontend:** on 401 with `code: 'SESSION_STALE'`, call `/auth/refresh` silently and retry. Existing refresh logic in `auth.store.ts` covers most cases; add the specific error code handling.

---

## Subphase 3h — `/me` endpoint split

Split the current `GET /users/me` into:
- `GET /users/me` — identity only (id, email, display_name, avatar_url, timezone, language, preferences, two_fa_enabled)
- `GET /users/me/memberships` — returns the list already present on `organizations/my-memberships`

The current `/users/me` shape isn't dropped — new fields absent, old fields stay. Frontend call sites updated in a follow-up PR (non-blocking).

---

## Subphase 3i — Audit log consumer

Audit log listing currently filters by session org via `users.organization_id`. Switch to the session's `organizationId` claim (already in JWT) and scope by `audit_logs.organization_id`. Pure swap — no data migration.

---

## Per-subphase testing

Each subphase gets:

- **1 unit test per new code path** verifying the flag-on behavior
- **1 integration test** end-to-end covering the user-visible scenario (e.g., 3c: "invite → click email → accept → land in Codeupscale")
- **Manual smoke in staging** — 24h soak before flipping the flag in prod
- **Drift audit** must remain 0 throughout

---

## Cumulative audit after 3i

Before declaring Phase 3 done:

```sql
-- Every user who logged in the last 7 days has an active organization_members row
SELECT COUNT(*) FROM users u
 WHERE u.last_login_at > NOW() - INTERVAL '7 days'
   AND NOT EXISTS (
     SELECT 1 FROM organization_members m WHERE m.user_id = u.id AND m.is_active = true
   );
-- = 0

-- Every active member is logged in at least once OR a placeholder (password_hash IS NULL is fine)
-- No query needed; sanity check

-- Every pending invitation is either consumable (pending + not expired) or terminal
SELECT status, COUNT(*) FROM invitations GROUP BY status;
-- Visual: none in weird states
```

---

## Rollback (any subphase)

```bash
# Flip the specific flag off in prod .env:
ssh prod "sed -i 's/READ_NEW_<FLAG>=true/READ_NEW_<FLAG>=false/' /home/ubuntu/infra/.env"
ssh prod "cd /home/ubuntu/infra && docker compose up -d bu-api"
```

Dual-write remained on through this entire phase, so the legacy data is still current. The rollback is instant and lossless.

---

## Completion criteria

- [ ] All 9 subphases deployed, each with its flag ON for ≥24h
- [ ] Drift audit: 0 throughout the phase
- [ ] No P1/P0 bugs reported
- [ ] All 280 unit tests + newly added integration tests green
- [ ] Frontend smoke tests pass on staging for: register, invite-new, invite-existing, accept, role change, deactivate, reactivate, org switch

---

## Next

Phase 4 — stop writing legacy columns.
