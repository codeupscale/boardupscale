# Multi-Tenant Architecture — Design & Transition Plan

**Status:** In review
**Owners:** Platform (backend) — needs product sign-off
**Supersedes:** `2026-04-21-per-org-membership-redesign.md` (merged into this doc)
**Estimated effort:** 3–4 focused weeks (phased; each phase is independently shippable and revertible)

---

## 0. Executive summary

Boardupscale's `users` table today conflates **identity** (who you are) with **membership** (what you can do in a given workspace). Every bug in the Apr 21–22 cluster traces back to that one decision. This document:

1. Lays out the target multi-tenant model (the shape Linear / Notion / Slack / Jira all use).
2. Enumerates every user scenario and edge case the system must handle.
3. Specifies the data model, flows, and API contract.
4. Defines a 6-phase zero-downtime transition that preserves every row of existing data.
5. Lists open product decisions that must be answered before any code ships.

**Non-goals** (explicitly out of scope for this change — tracked separately):
- Postgres row-level security policies
- SCIM/SAML auto-provisioning
- Federated identity (single-sign-on across tenant boundaries is already supported via OAuth; no change here)
- Billing per workspace (the Stripe subscription model assumes one org = one subscription today and that's unchanged)

---

## 1. Principles

1. **One identity, many memberships.** A human has exactly one `users` row. Every workspace they touch adds an `organization_members` row. Identity columns never carry per-org state.
2. **The tenant is a first-class parameter.** Every authorization check, every domain query, every audit log takes `(user_id, organization_id)` — never `user.organization_id` (there isn't one anymore).
3. **Membership is the authority record.** Role, active-state, invitation-state, per-workspace settings — all live on `organization_members`. Every consumer reads from there.
4. **Identity deletions are rare and protected.** `users` rows are the terminus of many FKs (issues, comments, audit logs). We soft-delete with a tombstone; hard deletes only when orphaned.
5. **Invitations are their own entity.** Not a column on `users`. Per-org, independently redeemable, explicitly revocable.
6. **Session context is explicit.** JWT carries `{ user_id, organization_id, membership_version }`. Role is re-resolved per request against the current membership — never trusted from the token.
7. **Backward compatibility during transition.** Every phase ships independently, dual-writes are audited, rollbacks don't lose data.

---

## 2. Scenario catalog

Every row below is a scenario the system MUST handle. "Current" = what happens today. "Target" = what happens after this redesign.

### 2.1 Registration & identity

| # | Scenario | Current | Target |
|---|---|---|---|
| R1 | Brand-new user registers, creates their own org | Works | Works; creates `users` + `organizations` + `organization_members(role=owner, is_default=true)` |
| R2 | User registers with email that exists (deactivated / placeholder) | Rejected as duplicate | Detected; user prompted to sign in to existing account and create a new workspace from their org list |
| R3 | OAuth (Google/GitHub) first sign-in | Creates user + org | Creates `users` + `organizations` + `organization_members(role=owner)`. Same as R1. |
| R4 | OAuth sign-in where email matches an existing user | Links to existing | Links to existing identity; no new org created; lands on their default workspace |
| R5 | User changes email | Global change, requires re-verify | Global change, re-verify. Unchanged. |
| R6 | User changes password | Global | Global. Unchanged. |
| R7 | User enables 2FA | Global | Global. 2FA is an identity concern, not per-workspace. |
| R8 | User deletes their own account (data subject erasure) | Cascade-deletes memberships; `users` rows referenced by issues/comments break | Soft-delete identity (`users.deleted_at`); scrub PII from `users` row; memberships cascade-deactivate; FK references remain valid pointing at a tombstoned row |

### 2.2 Membership & roles

| # | Scenario | Current | Target |
|---|---|---|---|
| M1 | Admin invites by email | Works for simple cases; breaks on cross-org emails | Creates `invitations` row keyed by `(email, organization_id)`; email sent; no `users` row touched until accept |
| M2 | Invited user accepts → account created | Works if they're new | Works identically for new users; existing-email path matches R4 |
| M3 | User already has active account; admin adds them to a new org | Inserts `organization_members` with role | Identical. Pending-invite row NOT created — user gets notification "You've been added to Org X" instead of accept-flow |
| M4 | Same person, different role per org (Admin in X, Member in Y) | Not supported — `users.role` is global | Native — `organization_members.role` is per-org |
| M5 | Role change | Writes `users.role` globally, corrupting other orgs | Writes `organization_members.role` for that org only |
| M6 | Deactivate user in Org X | Sets `users.is_active=false` globally — locks them out of Org Y too | Sets `organization_members.is_active=false` for that org; identity stays enabled; other orgs unaffected |
| M7 | Re-activate user in Org X after deactivate | Requires manual DB fix today | `UPDATE organization_members SET is_active=true` — one call, works |
| M8 | Remove user from org (hard removal) | Mostly works | Deletes the `organization_members` row; identity stays; user's FK references (issue reporter) stay |
| M9 | User leaves org voluntarily | Not implemented | New endpoint: deletes their own membership; `is_default=true` membership auto-picks another org or leaves user orphaned |
| M10 | Last owner of an org tries to leave/demote | Blocked by weak global check | Blocked by per-org check: `COUNT(*) WHERE org=X AND role='owner' > 1` |
| M11 | Last owner of an org is deactivated | Not blocked — org becomes unmanageable | Blocked with clear error; admin must transfer ownership first |

### 2.3 Invitations

| # | Scenario | Current | Target |
|---|---|---|---|
| I1 | Admin invites a brand-new email | Works | Creates `invitations` row; email sent; no `users` row until accept |
| I2 | Admin invites an existing active user | Shortcut adds to org immediately | Same: adds `organization_members`; no `invitations` row; user gets in-app notification |
| I3 | Admin invites an existing placeholder (Jira-migrated) user | Overwrites `users.email_verification_token` → silent breakage | Creates `invitations` row; existing user identity reused on accept |
| I4 | Two admins invite same email concurrently to SAME org | Last-wins silently | One row per `(email, org)` via UNIQUE; second invite returns 409 "Invite already pending — resend instead" |
| I5 | Two admins from DIFFERENT orgs invite same email | Last-wins silently; first email link dies | Both succeed independently (different PK tuple). Both emails valid. User can accept both. |
| I6 | Invited user clicks expired link | Works (marks expired) | Works identically; reads `invitations.expires_at` |
| I7 | Invited user clicks link AFTER inviter revoked it | Works — revoke doesn't invalidate | Blocked with "This invitation was revoked." (reads `invitations.status`) |
| I8 | Admin revokes a pending invite | Today: deletes the users row and hits FK violations | Deletes the `invitations` row (or flips to `status='revoked'` for audit). Identity untouched. |
| I9 | Resend invite | Generates new token on users row | Generates new token on the `invitations` row; previous link dies (scoped to this org only) |
| I10 | Invited user already deactivated in another org | Accepts into new org; other deactivation unchanged | Same. Per-org deactivation doesn't block invites to other orgs. |
| I11 | Invited user was fully deleted (identity tombstoned) | N/A | New identity created on accept; no prior tombstone is consulted (email uniqueness excludes tombstones) |
| I12 | Expired invitation cleanup | Manual | Daily job: `UPDATE invitations SET status='expired' WHERE expires_at < NOW() AND status='pending'` |
| I13 | Admin cancels an invite after sending but before expiry | No workflow | `/organizations/me/invitations/:id` DELETE |

### 2.4 Authentication & session

| # | Scenario | Current | Target |
|---|---|---|---|
| A1 | Login with password, user has one active org | Lands there | Lands there. Unchanged. |
| A2 | Login with password, user has multiple active orgs | Lands in `users.organization_id` (first registered org) | Lands in the membership marked `is_default=true`. Switcher available. |
| A3 | Login, user has zero active memberships (all deactivated) | Token issued but UI empty | Rejected at login with "Your account is not active in any workspace" |
| A4 | Login, user has only pending invites (never accepted) | Treated as invalid login | Login allowed; tokens issued with a sentinel org=null; UI routes to "Accept your pending invites" page |
| A5 | Session org-switch | Re-issue JWT with new org claim | Unchanged; uses `POST /auth/switch-org` |
| A6 | Role changed by admin in another session | User's JWT role claim is stale until expiry | JWT carries `membership_version`; bump version on role change; next request refreshes. (See §4.4) |
| A7 | User deactivated in current org mid-session | JWT still valid globally today | Membership check on every request detects `is_active=false`; returns 401 "workspace access revoked" |
| A8 | Refresh token after role change | Stale role | Refresh re-reads membership; emits fresh JWT |
| A9 | Cross-org token reuse (malicious) | Mitigated only by signature | Additionally tied to `user_id × organization_id`; a token for Org X cannot be replayed against Org Y even if signed |

### 2.5 Authorization & data visibility

| # | Scenario | Current | Target |
|---|---|---|---|
| Z1 | Admin in Org X opens Org Y | Blocked by JWT org claim | Blocked; the org is not in their memberships |
| Z2 | Admin in Org X reorders columns in Org X | Broken (slug vs UUID crash, fixed last hotfix) | Works; org-role check runs on `(user_id, org_id)` in `organization_members` |
| Z3 | Org owner views another org where they're a member | Works with current role | Each request resolves role from the membership for the REQUESTED org, not the JWT-encoded one |
| Z4 | Permission check for `resource/action` | Reads `users.role` (wrong in multi-org) | Reads `organization_members.role` for the request's org |
| Z5 | Fetch issues | Filtered by `project.organization_id` | Unchanged; projects already carry `organization_id` |
| Z6 | Search | Org-scoped via search service | Unchanged; org context comes from session |
| Z7 | Audit log read | `user.organization_id` — wrong for cross-org users | `audit_logs.organization_id` (already set); listing filtered by session org |
| Z8 | API key permissions | Tied to user globally | Each API key scoped to ONE membership → one org |

### 2.6 Jira migration interaction

| # | Scenario | Current | Target |
|---|---|---|---|
| J1 | Migrate Jira users into Org X; email doesn't exist in our DB | Creates user+membership — fine | Creates identity + membership. Unchanged. |
| J2 | Migrate Jira users; email already exists in another org | `ON CONFLICT (email)` updates the existing user's display_name/jira_account_id and adds membership for this org | Reuses identity; inserts `organization_members` for this org; `jira_account_id` stored **per-membership** so same person can have different Atlassian IDs in different Jira instances |
| J3 | Re-migrate same Jira source into same org | Idempotent via `ON CONFLICT` | Identical; membership conflict target becomes `(user_id, organization_id)` |
| J4 | Two Jira users share an email | Duplicate in bulk INSERT → silent drop (fixed with dedup) | Dedup stays; per-org membership model means they collapse to one person in this org, which matches Jira's own deduplication on email |
| J5 | Migrated user is later invited properly | Shows the wrong org (fixed in last hotfix) | Invitation is org-scoped from birth; no legacy column to read |
| J6 | Admin deletes a Jira-migrated placeholder from Org X | Hard delete fails (FK) | Removes the membership; identity preserved; issues still resolve the reporter |
| J7 | Large migration (10k+ users) | Works today but touches every user row | Membership writes only; no churn on `users` for existing identities |

### 2.7 Organization lifecycle

| # | Scenario | Current | Target |
|---|---|---|---|
| O1 | Create org (registration) | Works | Works |
| O2 | Rename org | Works | Works |
| O3 | Delete org | Cascade-deletes projects, issues, memberships; identity rows keep dangling pointers | Cascade-deletes projects+memberships. Users who were ONLY in that org see "Your last workspace was deleted" and can create a new one. Users in multiple orgs lose just this one. |
| O4 | Transfer ownership | Not implemented | New endpoint: promote another member to owner, demote self |
| O5 | Org suspension (billing, policy) | Not implemented | `organizations.status = 'suspended'`; read-only access for members |

### 2.8 Observability & ops

| # | Scenario | Current | Target |
|---|---|---|---|
| T1 | Count active members in Org X | Legacy query counts `users WHERE organization_id=X AND is_active=true` — misses cross-org | `SELECT COUNT(*) FROM organization_members WHERE organization_id=X AND is_active=true` |
| T2 | Find orphaned users (no active memberships) | Hard today | `SELECT u.id FROM users u LEFT JOIN organization_members m ON m.user_id = u.id WHERE m.user_id IS NULL` |
| T3 | Audit: who added user Y to Org X? | `audit_logs` partially | `organization_members.invited_by`, `joined_at`; plus `audit_logs` |
| T4 | Data export per org (GDPR, customer offboarding) | Hard — user rows span orgs | Clear boundary: export `organization_members` + domain rows for the target org; identities stay (the person exists) |

---

## 3. Edge cases (beyond the scenario catalog)

Enumerated here because any one of these tends to become a P0 bug in production:

1. **Concurrent role change + deactivation.** Two admins hit the same membership simultaneously. Resolved with row-level `UPDATE ... WHERE updated_at = :known_version`; last-writer-loses returns 409. Required because the UI shows stale state.
2. **Email case sensitivity.** We already lowercase on insert; enforce at the DB with `CITEXT` or a functional index `LOWER(email)`.
3. **Emoji in display names.** `VARCHAR(255)` counts bytes in some encodings; confirm it's characters. Already stored as UTF-8 — fine, but add a test.
4. **Pending invite for an email that later registers directly.** E.g. we invite `alice@foo.com`; before she accepts, she signs up herself. The invite still points at the email. On registration, we upsert the identity and any outstanding `invitations` rows become consumable on her next login (we show them on the "accept pending invites" page).
5. **User in N orgs; one org is deleted while they're logged in.** Next request: their JWT org claim is invalid (org gone). Server detects, returns 401 "workspace no longer exists"; frontend redirects to switcher.
6. **Soft-deleted identity tries to log in.** `users.deleted_at IS NOT NULL` → login rejected with generic "account not found" (no email enumeration). Audit event written.
7. **Revoked invite's token is replayed (timing attack).** Reject with 410 Gone. Don't reveal whether it was expired or revoked — both return the same error.
8. **Admin tries to deactivate themselves.** Explicit rejection "Cannot deactivate yourself; ask another admin."
9. **Deactivated user has issues assigned.** Deactivation doesn't reassign automatically (that destroys project history). Admin sees a "12 assigned issues — reassign?" CTA. Optional.
10. **Org admin downgraded to member mid-session.** Next privileged action hits the per-request permission check and 403s. Frontend refreshes and re-renders the UI with reduced permissions.
11. **Owner promoted themselves to admin in another org but is still owner of their home.** Permitted — roles are per-org. No global conflict.
12. **User with pending invites to Orgs X, Y, Z accepts X.** Y and Z stay pending until they click those links. Each accept is independent.
13. **Password reset — which org sends the email?** Password reset is identity-level; email is from the platform (`no-reply@boardupscale.com`), not any specific org. No per-org branding here; avoids leaking membership info.
14. **User logs in from a device in a country that triggers MFA policy.** MFA is identity-level. Policy can be org-level in the future (out of scope).
15. **Bulk org deactivation (customer offboarding).** New helper: deactivate ALL memberships for an org in one query; audit event.
16. **Jira re-migration of an org that has acceptance history.** New placeholder users replace nothing; existing accepted users re-link via email; their real account stays. No role demotion.
17. **Invitation email bounces.** Out of scope now; tracking bounce state via SES/SendGrid is a later improvement.
18. **Session cookie rotation.** Refresh tokens get a new `membership_version` claim with each rotate. No changes needed from identity side.
19. **Cross-tenant data leak via search.** Search service is already org-scoped. Verified by an integration test we'll add.
20. **Seed data / test fixtures.** Integration tests currently assume `user.organization_id`. Migrating fixtures is a task in Phase 3.

---

## 4. Target data model

### 4.1 Schema

```sql
-- IDENTITY ---------------------------------------------------------
users
  id                     uuid PK
  email                  CITEXT UNIQUE NOT NULL       -- case-insensitive, NO per-org duplicates
  password_hash          varchar(255)
  display_name           varchar(255) NOT NULL
  avatar_url             text
  timezone               varchar(100)
  language               varchar(10) DEFAULT 'en'
  email_verified         boolean DEFAULT false
  oauth_provider         varchar(50)
  oauth_id               varchar(255)
  two_fa_enabled         boolean DEFAULT false
  two_fa_secret          text
  backup_codes           text[]
  last_login_at          timestamptz
  failed_login_attempts  int DEFAULT 0
  locked_until           timestamptz
  deleted_at             timestamptz                  -- soft-delete tombstone
  created_at             timestamptz DEFAULT NOW()
  updated_at             timestamptz DEFAULT NOW()

-- REMOVED: organization_id, role, is_active, invitation_status,
--          jira_account_id, email_verification_token, email_verification_expiry,
--          pending_invite_organization_id
--          (all moved to organization_members or invitations)


-- MEMBERSHIP -------------------------------------------------------
organization_members
  user_id                uuid REFERENCES users(id) ON DELETE CASCADE
  organization_id        uuid REFERENCES organizations(id) ON DELETE CASCADE
  PRIMARY KEY (user_id, organization_id)
  role                   varchar(50) NOT NULL CHECK (role IN ('owner','admin','manager','member','viewer'))
  is_active              boolean NOT NULL DEFAULT true
  is_default             boolean NOT NULL DEFAULT false
  jira_account_id        varchar(255)                 -- per-org Atlassian mapping
  joined_at              timestamptz NOT NULL DEFAULT NOW()
  invited_by             uuid REFERENCES users(id) ON DELETE SET NULL
  deactivated_at         timestamptz
  last_active_at         timestamptz
  notification_prefs     jsonb DEFAULT '{"email":true,"in_app":true}'
  version                bigint NOT NULL DEFAULT 1    -- optimistic concurrency + session invalidation
  created_at             timestamptz DEFAULT NOW()
  updated_at             timestamptz DEFAULT NOW()

  UNIQUE (organization_id, jira_account_id) WHERE jira_account_id IS NOT NULL
  UNIQUE (user_id)         WHERE is_default = true   -- exactly one default per user
  INDEX (organization_id, is_active)
  INDEX (organization_id, role)


-- INVITATIONS ------------------------------------------------------
invitations
  id                     uuid PK DEFAULT gen_random_uuid()
  organization_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
  email                  CITEXT NOT NULL
  role                   varchar(50) NOT NULL DEFAULT 'member'
  token_hash             char(64) NOT NULL UNIQUE     -- SHA-256 hex
  status                 varchar(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','accepted','revoked','expired'))
  invited_by             uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT
  invited_at             timestamptz NOT NULL DEFAULT NOW()
  expires_at             timestamptz NOT NULL
  accepted_at            timestamptz
  accepted_user_id       uuid REFERENCES users(id) ON DELETE SET NULL
  revoked_at             timestamptz
  revoked_by             uuid REFERENCES users(id) ON DELETE SET NULL

  UNIQUE (organization_id, email) WHERE status = 'pending'   -- I4 constraint
  INDEX (email) WHERE status = 'pending'                     -- for "my pending invites" query
  INDEX (organization_id, status)


-- AUDIT (unchanged, already correct) -------------------------------
audit_logs
  id, organization_id, actor_user_id, ...             -- already per-org
```

### 4.2 What moves where

| Column (source) | Destination | Migration strategy |
|---|---|---|
| `users.organization_id` | Implied by `organization_members`; `is_default=true` on the "home" | Backfill from `organization_members` if present, else the legacy value |
| `users.role` | `organization_members.role` | Backfill: for each membership row, copy `users.role` if same org; else leave 'member' |
| `users.is_active` | `organization_members.is_active` | Backfill as above |
| `users.invitation_status` | Derived from `invitations.status` OR dropped if never invited | Backfill `invitations` from `users` where token exists; others drop |
| `users.jira_account_id` | `organization_members.jira_account_id` | Backfill: set on the membership matching the user's home org |
| `users.email_verification_token` | `invitations.token_hash` | Move one-for-one |
| `users.email_verification_expiry` | `invitations.expires_at` | Move one-for-one |
| `users.pending_invite_organization_id` | `invitations.organization_id` (via the row above) | Already aligned |

### 4.3 Authorization model

```
Request arrives
  ├── JWT valid? (signature, not expired)     → 401 if fail
  ├── org_id in JWT matches request.org?      → 403 if fail
  ├── Load membership (user_id, org_id)
  │       missing or inactive?                → 401 "workspace access revoked"
  ├── Membership.version == JWT.mv?
  │       mismatch?                            → 401 "session expired, re-auth"
  ├── RequiredPermission?
  │       yes: check membership.role against permission matrix → 403 if fail
  └── Handler runs with (user, org, membership)
```

- Org shortcut: `membership.role IN ('owner','admin')` → allow everything in this org.
- Project-level: hybrid. Owner/admin of org short-circuits. Otherwise, check `project_members.role` for the project.
- API keys: a key IS a membership scope. Token contains `(api_key_id, org_id)`. No cross-org use.

### 4.4 Session invalidation via `membership.version`

- JWT adds claim `mv: <membership.version>`.
- Any UPDATE to `organization_members` (role change, deactivate, activate) bumps `version = version + 1`.
- Next request: server compares JWT `mv` with current DB `version`. Mismatch → 401 forces refresh.
- Refresh endpoint re-reads DB and issues a new JWT with the new `mv`.
- Tradeoff: one extra scalar read per request. Acceptable because it's a single indexed lookup.

### 4.5 Invitation flow (target)

```
POST /organizations/me/invites
  ├── row exists in invitations WHERE org_id=? AND email=? AND status='pending'?
  │       yes → 409 { code: 'INVITE_PENDING', action: 'resend' }
  ├── existing identity with email=?                   → "soft invite" (add membership directly, send "you've been added" email)
  ├── no identity                                      → insert invitations row, send email with token
  └── audit event

GET /auth/validate-invite?token=
  ├── hash → lookup invitations
  ├── status='pending' AND expires_at > NOW()?         → return { org_name, email, role }
  ├── status='revoked'                                  → 410 { code: 'INVITE_REVOKED' }
  ├── status='accepted'                                 → 410 { code: 'INVITE_ALREADY_ACCEPTED' }
  ├── expires_at <= NOW()                               → 410 { code: 'INVITE_EXPIRED' }; also UPDATE status='expired'

POST /auth/accept-invite
  ├── resolve invitation (same as validate)
  ├── if identity with email exists → link  (no account creation)
  │   else                          → create users row
  ├── insert organization_members(user_id, org_id, role)
  ├── if user has no other memberships → is_default=true
  ├── UPDATE invitations SET status='accepted', accepted_user_id, accepted_at=NOW()
  ├── issue JWT with new org as session
  └── audit event

POST /organizations/me/invites/:id/revoke
  ├── UPDATE invitations SET status='revoked', revoked_at, revoked_by
  └── audit event

DELETE /organizations/me/invites/:id
  └── hard-delete the row (for admin UI "cancel & remove")
```

### 4.6 Deactivation & reactivation flow

```
POST /organizations/me/members/:user_id/deactivate
  ├── membership exists for (user_id, org)?            → 404 if not
  ├── last owner?                                      → 400 if yes
  ├── UPDATE organization_members SET is_active=false, deactivated_at=NOW(), version=version+1
  ├── revoke the user's refresh tokens for this org (kicks session)
  └── audit

POST /organizations/me/members/:user_id/activate
  ├── membership exists?                               → 404 if not
  ├── UPDATE organization_members SET is_active=true, deactivated_at=NULL, version=version+1
  └── audit
```

### 4.7 Hard-delete vs soft-delete

| Action | Mechanism |
|---|---|
| Remove user from org (admin action) | Delete `organization_members` row. Identity untouched. |
| Deactivate user in org | `organization_members.is_active=false`. Row kept for audit. |
| Delete identity (user-initiated account deletion, GDPR) | `users.deleted_at=NOW()`, scrub PII (email→`deleted+<uuid>@tombstone.invalid`, display_name→`Deleted User`, clear oauth_id/avatar/etc). Memberships cascade-delete. FK references (issue.reporter_id, etc.) stay valid pointing at the tombstoned row. |
| Delete org | Existing CASCADE. Users unaffected except they lose one membership. |

---

## 5. Transition plan — 6 phases, zero downtime

Each phase is:
- **Independently shippable** (can merge to main and deploy without the next phase)
- **Independently revertible** (if something breaks in prod, the previous phase's behavior still works)
- **Validated by automated audit queries** before the next phase starts

### Phase 0: pre-work (no schema changes)

**Goal:** make the current codebase resilient to the inconsistencies the real fix will sweep up.

- [x] Short-term hotfixes already shipped Apr 21–22:
  - [x] `ck_jira_migration_runs_phase` widened
  - [x] Jira dedup on email
  - [x] Revoke doesn't hard-delete
  - [x] Edit/role use membership-first lookup
  - [x] Project remove-member sends userId
  - [x] 19 hooks read the right error envelope
  - [x] Permission guard uses per-org role
  - [x] `pending_invite_organization_id` column (interim)
- [ ] Add a **dual-source audit endpoint** (admin-only) that cross-checks `users` vs `organization_members` for drift. Used in every subsequent phase to verify correctness.

### Phase 1: additive schema (1 day)

**Goal:** create the new shape alongside the old. Nothing reads or writes the new columns yet.

- Migration: add to `organization_members`:
  - `is_active boolean NOT NULL DEFAULT true`
  - `is_default boolean NOT NULL DEFAULT false`
  - `jira_account_id varchar(255)`
  - `invited_by uuid`
  - `deactivated_at timestamptz`
  - `last_active_at timestamptz`
  - `version bigint NOT NULL DEFAULT 1`
- Migration: create `invitations` table per §4.1.
- Migration: add `users.deleted_at timestamptz` (even though soft-delete isn't wired up yet — cheap and we want the column in place).
- Migration: add `CITEXT` extension if not present, change `users.email` to `CITEXT`.
- Backfill within the same migration (small and fast — under 1 min for 250K rows):
  ```sql
  UPDATE organization_members m
  SET is_active = u.is_active,
      jira_account_id = u.jira_account_id
  FROM users u WHERE m.user_id = u.id;

  -- Promote one membership per user to is_default = (users.organization_id matches)
  UPDATE organization_members SET is_default = true
  WHERE (user_id, organization_id) IN (
    SELECT u.id, u.organization_id FROM users u
    WHERE u.organization_id IS NOT NULL
  );

  -- Migrate pending invites
  INSERT INTO invitations (organization_id, email, token_hash, status, invited_by, expires_at)
  SELECT u.pending_invite_organization_id, u.email, u.email_verification_token,
         'pending', <system user fallback>, u.email_verification_expiry
  FROM users u
  WHERE u.invitation_status = 'pending'
    AND u.email_verification_token IS NOT NULL
    AND u.pending_invite_organization_id IS NOT NULL;
  ```
- **Audit query** (must return 0): `SELECT COUNT(*) FROM users u WHERE u.invitation_status='pending' AND NOT EXISTS (SELECT 1 FROM invitations i WHERE i.email=u.email AND i.status='pending')`.
- **Rollback:** `DROP TABLE invitations; ALTER TABLE ... DROP COLUMN ...`. No data lost because `users` still has all original fields.

### Phase 2: dual-write (3 days)

**Goal:** every write that touches a migrated column writes to BOTH the old and new locations. Reads still use old.

- Every call that writes `users.role` also writes `organization_members.role` for the current org.
- Every call that writes `users.is_active` also writes `organization_members.is_active`.
- Every call that writes `users.jira_account_id` also writes the membership column.
- Invitation creation writes to BOTH the `users.email_verification_token` column AND the new `invitations` table.
- Daily cron: the drift audit from Phase 0 runs; alerts if non-zero.

**Call sites affected (known from the codebase):**
- `auth.service.ts` — register, acceptInvitation, updateProfile
- `organizations.service.ts` — invite, inviteExisting, updateMemberRole, deactivateMember, revokeInvitation, updateMigratedMemberEmail, bulkInvitePending
- `organization-members.service.ts` — addMembership
- Jira migration worker — Phase 1 member upsert
- Users service — update, activateInvitedUser

Estimated: ~15 call sites. Each gets a test.

**Rollback:** disable dual-write (feature flag) → old code path keeps working. Data written to new location is orphaned but not wrong.

### Phase 3: flip reads, one consumer at a time (1–2 weeks)

**Goal:** cut each consumer over from old location to new. Each is its own PR.

Order, hardest-value-first:

1. **RBAC guard** — already done in the hotfix; remove the legacy fallback after this phase.
2. **Member list (`getMembers`)** — purely membership-driven; drop the legacy-users union.
3. **Invitation validate/accept** — cut over to `invitations` table.
4. **Invite email** — read org name from `invitations.organization_id`.
5. **Jira migration** — write `organization_members.jira_account_id` instead of `users.jira_account_id`.
6. **Deactivate / activate** — already dual-writing; flip read.
7. **JWT claims** — `mv` replaces implicit trust in `role`; every request re-reads.
8. **User profile endpoint** — return identity-only fields, plus a separate `/me/memberships` endpoint that returns the list.
9. **Audit log listing** — already org-scoped, minor consumer check.

Each PR includes:
- Read flipped
- Tests updated
- Audit query confirms old/new are still in sync (dual-write keeps them aligned)

**Rollback at any step:** revert the PR. Dual-write is still running, so data hasn't diverged.

### Phase 4: freeze legacy writes (3 days)

**Goal:** stop writing the old columns. The old path becomes read-only and serves only as a safety net.

- Remove the dual-write branches shipped in Phase 2.
- `users.role`, `users.is_active`, `users.invitation_status`, `users.jira_account_id`, `users.email_verification_token`, `users.email_verification_expiry`, `users.pending_invite_organization_id` stop receiving new data.
- Monitor for 1 week — if anything still reads these, it surfaces in logs (we'll add a column-access audit query).
- No rollback strategy needed — the read flip in Phase 3 already covered the transition.

### Phase 5: drop legacy columns (1 day)

**Goal:** finalize the new shape.

- Migration:
  ```sql
  ALTER TABLE users
    DROP COLUMN organization_id,
    DROP COLUMN role,
    DROP COLUMN is_active,
    DROP COLUMN invitation_status,
    DROP COLUMN jira_account_id,
    DROP COLUMN email_verification_token,
    DROP COLUMN email_verification_expiry,
    DROP COLUMN pending_invite_organization_id;
  DROP INDEX IF EXISTS IDX_users_org_invitation_status;
  DROP INDEX IF EXISTS IDX_users_jira_account_id;
  DROP INDEX IF EXISTS IDX_users_pending_invite_org;
  ```
- Test suite updated to assume new shape only.
- Rollback window: 24 hours. If production is stable, the old columns stay dropped. If anything regresses, `DOWN` adds them back and re-populates from `organization_members` (lossy for anything written in the interim — but we'll have 24 hours of monitoring before this is committed).

### Phase 6: post-work (1 week, ongoing)

- Expired-invite cleanup cron.
- Drift audit alert (should always be zero now that there's only one source of truth).
- Performance regression check — the membership join adds one JOIN to some queries; verify indexes.
- Documentation: update the `CLAUDE.md` and any runbooks that reference the old shape.

---

## 6. Data integrity guarantees

1. **No row loss.** Every `users`, `organization_members`, `invitations`, `audit_logs` row existing before Phase 0 exists after Phase 5. Verified by:
   - Row count on each table before/after each phase.
   - `pg_dump` snapshot before Phase 1. Compared against the final state with a diff script that tolerates column removal from `users` but fails on any PK that changed or disappeared.

2. **No orphaned references.** Every FK reference (issue.reporter_id → users.id, etc.) still resolves after Phase 5. Verified by:
   ```sql
   SELECT COUNT(*) FROM issues i LEFT JOIN users u ON u.id = i.reporter_id WHERE u.id IS NULL;
   -- Must return 0
   ```
   Run after each phase.

3. **Role / access parity.** For every `(user_id, org_id)` pair, `organization_members.role` after the transition equals the effective role before it. Verified by a pre/post diff.

4. **No silent loss of pending invites.** For every user with `invitation_status='pending'` before Phase 1, there's an `invitations` row with same email + target org after.

5. **Idempotent migrations.** Every migration's `up()` is idempotent — rerun-safe — and every `down()` is tested locally on a restored prod snapshot.

6. **Backups.** Full DB snapshot before Phase 1 AND before Phase 5. 30-day retention. Restore procedure documented and tested before cutover.

---

## 7. Testing strategy

- **Unit tests:** every service method touched gets a new test. Target: 100% coverage on `organization_members.service.ts`, `invitations.service.ts`, `permissions.service.ts`. Existing 280 tests all pass.
- **Integration tests:** 12 end-to-end flows, each per phase:
  - Register → invite → accept (same org)
  - Invite existing user → accept
  - Cross-org invite → accept → correct workspace
  - Concurrent invites to same org → 409
  - Concurrent invites to different orgs → both succeed
  - Deactivate in org A → still active in org B
  - Jira migrate → invite existing Jira user → correct org after accept
  - Role change in org A doesn't affect org B
  - Owner demote blocked when only one owner
  - Org delete → remaining memberships intact
  - Account deletion → issue reporter still resolves to tombstoned user
  - Org switcher shows only active memberships
- **Load test:** simulate 10k concurrent invites + 1k concurrent role changes. Verify `version` concurrency control holds.
- **Manual smoke test after each phase deploy:**
  - Invite a brand-new email, verify email, click link, complete registration, land in the right workspace.
  - Invite an existing user, verify they show up as a new member without re-registration.
  - Change a role, confirm the change persisted per-org only.
  - Deactivate, reactivate.

---

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Dual-write drift during Phase 2 | Medium | High | Daily audit cron; bail on any drift > 0 |
| Rollback after dropping columns (Phase 5) | Low | High | 24h monitoring window; snapshot before drop; feature flag fallback kept in code for 1 release |
| Performance regression (extra JOIN on every request) | Medium | Medium | Indexes added in Phase 1; perf test before Phase 3 |
| Downstream integrations (analytics, CDC, reports) that read `users.organization_id` directly | Medium | Medium | Grep for references now; update before Phase 4 |
| Bug in invitation uniqueness constraint with concurrent inserts | Low | Medium | Serialized via the `UNIQUE (organization_id, email) WHERE status='pending'` constraint — Postgres handles atomically |
| Incomplete backfill in Phase 1 | Low | High | Audit queries gate the transition; CI fails if any row is orphaned |

---

## 9. Open product decisions (REVIEW REQUIRED)

These need your answer before any code gets written. Each one changes the design:

### Q1. Role precedence across orgs in the UI

If Alice is **Owner of A** and **Member of B**, and she's browsing B, what's her "badge" in shared UI (e.g., a mention, an activity feed that pulls across orgs)?
- **Option A:** Always shown as the role in the org where the content lives (recommended).
- **Option B:** Global "max role" displayed (confusing — Linear doesn't do this).

### Q2. Default workspace on login

When Alice has multiple active memberships:
- **Option A:** Show a workspace picker on first login, remember the choice (Linear).
- **Option B:** Always land in `is_default=true` (our current fix).
- **Option C:** Land in the most-recently-used workspace (Notion).

### Q3. Invitation email wording when user already has an account

- **Option A:** "You've been added to Codeupscale by Rohail. Open it now." (no token needed, no accept click)
- **Option B:** "Accept your invitation" with a click-through even for existing users (cleaner audit trail).

### Q4. Last-owner transfer workflow

When the only owner wants to leave:
- **Option A:** Force them to promote someone to owner first ("Transfer Ownership" modal).
- **Option B:** Auto-promote the longest-tenured admin.
- **Option C:** Block the action entirely; support ticket required.

### Q5. Identity deletion (GDPR)

- **Option A:** Self-service; user can delete their account from settings. Memberships cascade; content authored by them keeps pointing at a tombstoned row.
- **Option B:** Admin-initiated only; user requests via support.

### Q6. Can a user have TWO pending invites for the SAME org?

Constraint: `UNIQUE (organization_id, email) WHERE status = 'pending'`.
- **Option A:** No — second invite returns 409, admin must resend or revoke first (recommended; I4 in scenario catalog).
- **Option B:** Yes — second overwrites first (last-wins; same as today).

### Q7. Should `jira_account_id` truly be per-membership?

Real use case: a user has TWO Jira Cloud sites (e.g., company A and contractor work at company B). Their Atlassian account IDs differ per site. Putting the ID on the membership makes this work.
- **Option A:** Per-membership (correct for Jira's data model; one extra join on resolution).
- **Option B:** Single global `jira_account_id` on the user (simpler but wrong if a user ever legitimately has two).

### Q8. Background invite-expiry cron — who runs it?

- **Option A:** `worker` service on a BullMQ repeatable job (recommended — we already have BullMQ).
- **Option B:** Postgres `pg_cron` (less observable).

---

## 10. Rollout timeline (once decisions above are locked)

| Week | Work | Owner |
|---|---|---|
| 1 | Phases 0 + 1: schema migrations + backfill | Backend |
| 2 | Phase 2: dual-write everywhere | Backend |
| 3 | Phase 3a: flip reads for RBAC, member list, invites | Backend |
| 4 | Phase 3b: flip remaining consumers; load + integration testing | Backend + QA |
| 5 | Phase 4: freeze legacy writes; 1-week soak | Backend + DevOps |
| 6 | Phase 5: drop columns; post-work; docs | Backend |

Total: **6 weeks calendar, ~3 weeks of engineering time** (because soak/observation windows aren't active work). If you want it faster, compress Phases 3a + 3b into one PR sequence — probably saves a week but adds risk.

---

## 11. Success metrics

Measured before the first phase ships and after Phase 5 completes:

1. **Zero cross-org bugs reported** in the 30 days after Phase 5 (baseline: 8 fixed in 12 hours pre-redesign).
2. **Drift audit returns 0** every day during Phase 3.
3. **P95 latency on `/me/memberships`** under 50ms.
4. **P95 latency on any authenticated request** regresses by <10% (vs the current baseline).
5. **Row counts** match pre/post for every table except `users` (which loses columns but not rows).
6. **No support tickets** related to "I can't see my workspace" or "I got invited but it showed the wrong org."

---

## Appendix A: call sites to update (partial, from current grep)

```
services/api/src/common/guards/roles.guard.ts
services/api/src/modules/auth/auth.service.ts       (register, login, acceptInvitation, validateInvitation)
services/api/src/modules/auth/auth.controller.ts    (verify-email, accept-invite, validate-invite)
services/api/src/modules/organizations/organizations.service.ts   (inviteMember, updateMemberRole, updateMemberInfo, deactivateMember, resendInvitation, revokeInvitation, updateMigratedMemberEmail, bulkInvitePending, generateAndSendInvitation, repairOrgMemberships)
services/api/src/modules/organizations/organization-members.service.ts
services/api/src/modules/permissions/permissions.service.ts       (checkPermission, checkOrgLevelPermission)
services/api/src/modules/users/users.service.ts     (activateInvitedUser, findByEmailVerificationToken)
services/worker/src/migration/jira-migration.processor.ts         (Phase 1 runMembersPhase)
services/web/src/hooks/useOrganization.ts
services/web/src/hooks/useAuth.ts
services/web/src/store/auth.store.ts                (JWT handling, mv claim)
services/web/src/pages/auth/AcceptInvitePage.tsx
```

~20 TypeScript files, 6 DTOs, 4 migrations, ~15 new/updated tests.

---

## Appendix B: links

- Scenario bugs triaged Apr 21–22 (all resolved in hotfixes): commits `a702d50` → `b3afd09`.
- Superseded design: `2026-04-21-per-org-membership-redesign.md` (content merged into §4 and §9 above).
