# Multi-Tenant Architecture — Complete Plan (Consolidated)

> **This is the single-file view.** All content below is also in the individual files under `docs/superpowers/plans/multi-tenant/` and `docs/superpowers/specs/` — this document just stitches them together in reading order so you can review the full plan top-to-bottom.
>
> **Branch:** this work lives on `feat/multi-tenant-v2`. Main stays free for bug fixes and feature work. The branch auto-syncs from `main` daily via `.github/workflows/sync-main-to-multi-tenant.yml`.
>
> **Last updated:** auto-regenerated from source files each time the branch builds.

---

## Contents

1. [Design — Architecture, Scenarios, Edge Cases](#part-1--design-spec)
2. [Master Plan — Phase Overview + Invariants](#part-2--master-plan)
3. [Testing Strategy](#part-3--testing-strategy)
4. [Phase 0 — Drift Audit + Perf Baseline](#phase-0--drift-audit--perf-baseline)
5. [Phase 0.5 — Production Data Cleanup](#phase-05--production-data-cleanup)
6. [Phase 1 — Additive Schema + Backfill](#phase-1--additive-schema--backfill)
7. [Phase 2 — Dual-Write](#phase-2--dual-write)
8. [Phase 3 — Flip Reads (9 subphases)](#phase-3--flip-reads-9-subphases)
9. [Phase 4 — Freeze Legacy Writes](#phase-4--freeze-legacy-writes)
10. [Phase 5 — Drop Legacy Columns](#phase-5--drop-legacy-columns)
11. [Phase 6 — Post-Work](#phase-6--post-work)
12. [Rollback Drill Log](#rollback-drill-log)

---

# PART 1 — Design Spec

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

---

# PART 2 — Master Plan

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

---

# PART 3 — Testing Strategy

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

---

# Phase 0 — Drift Audit Observability

**Goal:** Build the observability layer we need for the entire transition. Every subsequent phase leans on the drift audit to know if something went sideways.

**Duration:** 1 day
**Deploys:** 1
**Prerequisites:** Hotfixes from Apr 21–22 already shipped (commits `a702d50` through `b3afd09` + `fd91170`, `9b1bd84`).
**Rollback:** Not applicable — pure additive code. Worst case: disable the cron.

---

## What ships in this phase

1. `AuditService.checkMultiTenantDrift()` — a read-only service that runs every invariant query from `README.md` and returns structured results.
2. `GET /admin/audit/multi-tenant-drift` — admin-only endpoint returning the latest audit result.
3. BullMQ repeatable job running the audit hourly, logging results and alerting on non-zero drift.
4. PostHog event + Slack webhook on drift > 0.
5. **Performance baseline capture** (new in v2): k6 script `scripts/load/multi-tenant-baseline.js` run against prod during a low-traffic window; results committed to `docs/superpowers/plans/multi-tenant/baselines/`.
6. **Shadow DB provisioned** (new in v2): `boardupscale_shadow` database populated from the latest `pg_dump`, on a sibling host or the same host with a different `datname`. Every subsequent migration dry-runs here first.
7. **`drill-log.md` initialized** (new in v2): empty log file; each phase appends its rollback drill results here.

---

## Pre-flight checklist

- [ ] Confirm production is on commit `b3afd09` or later (all hotfixes applied)
- [ ] Confirm BullMQ worker is running (`docker ps | grep bu-worker`)
- [ ] Confirm Redis is healthy (drift job uses Redis for deduplication)
- [ ] SLACK_DRIFT_WEBHOOK_URL configured in `/home/ubuntu/infra/.env` (or skip Slack alerts — logs are enough)

---

## Files to create

### API

**`services/api/src/modules/audit/multi-tenant-drift.service.ts`** (new file)

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface DriftReport {
  ranAt: string;
  totalDrift: number;
  checks: Array<{
    name: string;
    expectedZero: boolean;
    actual: number;
    passed: boolean;
    sampleRows?: unknown[];
  }>;
}

@Injectable()
export class MultiTenantDriftService {
  private readonly logger = new Logger(MultiTenantDriftService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async check(): Promise<DriftReport> {
    const checks: DriftReport['checks'] = [];

    const run = async (name: string, sql: string, sampleSql?: string) => {
      const { count } = await this.ds.query(sql).then((r) => r[0] ?? { count: 0 });
      const actual = Number(count);
      const passed = actual === 0;
      const check = { name, expectedZero: true, actual, passed } as DriftReport['checks'][number];
      if (!passed && sampleSql) {
        check.sampleRows = await this.ds.query(sampleSql);
      }
      checks.push(check);
    };

    // Invariant B: orphaned FKs
    await run(
      'orphan.issues.reporter',
      `SELECT COUNT(*)::int AS count FROM issues i LEFT JOIN users u ON u.id = i.reporter_id WHERE u.id IS NULL`,
    );
    await run(
      'orphan.issues.assignee',
      `SELECT COUNT(*)::int AS count FROM issues i LEFT JOIN users u ON u.id = i.assignee_id WHERE i.assignee_id IS NOT NULL AND u.id IS NULL`,
    );
    await run(
      'orphan.comments.author',
      `SELECT COUNT(*)::int AS count FROM comments c LEFT JOIN users u ON u.id = c.author_id WHERE u.id IS NULL`,
    );
    await run(
      'orphan.attachments.uploaded_by',
      `SELECT COUNT(*)::int AS count FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE u.id IS NULL`,
    );
    await run(
      'orphan.org_members.user',
      `SELECT COUNT(*)::int AS count FROM organization_members m LEFT JOIN users u ON u.id = m.user_id WHERE u.id IS NULL`,
    );
    await run(
      'orphan.org_members.org',
      `SELECT COUNT(*)::int AS count FROM organization_members m LEFT JOIN organizations o ON o.id = m.organization_id WHERE o.id IS NULL`,
    );

    // Invariant E: exactly one default membership per user
    await run(
      'default.membership.multiple_per_user',
      `SELECT COUNT(*)::int AS count FROM (
         SELECT user_id FROM organization_members WHERE is_default = true
         GROUP BY user_id HAVING COUNT(*) > 1
       ) x`,
      `SELECT user_id, COUNT(*) FROM organization_members WHERE is_default = true
         GROUP BY user_id HAVING COUNT(*) > 1 LIMIT 20`,
    );

    // Phase 2+ invariants — will return 0 until then, skipped here:
    //   Invariant C (role/is_active parity) — requires org_members.is_active column (Phase 1)
    //   Invariant D (invitations drift) — requires invitations table (Phase 1)

    const totalDrift = checks.filter((c) => !c.passed).reduce((sum, c) => sum + c.actual, 0);
    const report: DriftReport = { ranAt: new Date().toISOString(), totalDrift, checks };

    if (totalDrift > 0) {
      this.logger.error(`[MT-Drift] ${totalDrift} drift rows detected`, JSON.stringify(checks));
    } else {
      this.logger.log('[MT-Drift] All invariants clean');
    }

    return report;
  }
}
```

**`services/api/src/modules/audit/audit.controller.ts`** (new file)

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { MultiTenantDriftService } from './multi-tenant-drift.service';

@ApiTags('admin-audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/audit')
export class AuditController {
  constructor(private drift: MultiTenantDriftService) {}

  @Get('multi-tenant-drift')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Run the multi-tenant invariant audit on demand' })
  async runDrift() {
    return this.drift.check();
  }
}
```

**`services/api/src/modules/audit/audit.module.ts`** (new file)

```typescript
import { Module } from '@nestjs/common';
import { MultiTenantDriftService } from './multi-tenant-drift.service';
import { AuditController } from './audit.controller';

@Module({
  controllers: [AuditController],
  providers: [MultiTenantDriftService],
  exports: [MultiTenantDriftService],
})
export class AuditModule {}
```

**`services/api/src/app.module.ts`** — import `AuditModule`.

### Worker

**`services/worker/src/drift-audit/drift-audit.processor.ts`** (new file) — BullMQ job that calls the same SQL queries as the API service. Do NOT import the Nest service; the worker is plain Node. Duplicate the query list; keep them in sync via a shared constants file in Phase 2.

```typescript
import { Worker, Queue, JobsOptions } from 'bullmq';
import { Pool } from 'pg';
import { createRedisConnection } from '../redis';
import { config } from '../config';

const QUEUE_NAME = 'drift-audit';
const REPEAT_EVERY_MS = 60 * 60 * 1000; // 1 hour

const CHECKS: Array<{ name: string; sql: string }> = [
  { name: 'orphan.issues.reporter',          sql: `SELECT COUNT(*)::int AS c FROM issues i LEFT JOIN users u ON u.id = i.reporter_id WHERE u.id IS NULL` },
  { name: 'orphan.issues.assignee',          sql: `SELECT COUNT(*)::int AS c FROM issues i LEFT JOIN users u ON u.id = i.assignee_id WHERE i.assignee_id IS NOT NULL AND u.id IS NULL` },
  { name: 'orphan.comments.author',          sql: `SELECT COUNT(*)::int AS c FROM comments c LEFT JOIN users u ON u.id = c.author_id WHERE u.id IS NULL` },
  { name: 'orphan.attachments.uploaded_by',  sql: `SELECT COUNT(*)::int AS c FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE u.id IS NULL` },
  { name: 'orphan.org_members.user',         sql: `SELECT COUNT(*)::int AS c FROM organization_members m LEFT JOIN users u ON u.id = m.user_id WHERE u.id IS NULL` },
  { name: 'orphan.org_members.org',          sql: `SELECT COUNT(*)::int AS c FROM organization_members m LEFT JOIN organizations o ON o.id = m.organization_id WHERE o.id IS NULL` },
  { name: 'default.membership.multiple',     sql: `SELECT COUNT(*)::int AS c FROM (SELECT user_id FROM organization_members WHERE is_default=true GROUP BY user_id HAVING COUNT(*)>1) x` },
];

export function startDriftAuditWorker(db: Pool): Worker {
  const connection = createRedisConnection();
  const queue = new Queue(QUEUE_NAME, { connection });

  // Schedule the repeatable job (idempotent upsert).
  void queue.add(
    'run',
    {},
    {
      jobId: 'drift-audit-hourly',
      repeat: { every: REPEAT_EVERY_MS, immediately: true },
      removeOnComplete: 24,
      removeOnFail: 24,
    } satisfies JobsOptions,
  );

  return new Worker(
    QUEUE_NAME,
    async () => {
      const results: Array<{ name: string; count: number }> = [];
      for (const c of CHECKS) {
        const { rows } = await db.query<{ c: number }>(c.sql);
        results.push({ name: c.name, count: Number(rows[0]?.c ?? 0) });
      }
      const totalDrift = results.reduce((s, r) => s + r.count, 0);
      console.log(`[drift-audit] totalDrift=${totalDrift}`, JSON.stringify(results));

      if (totalDrift > 0 && config.slackDriftWebhookUrl) {
        await notifySlack(config.slackDriftWebhookUrl, totalDrift, results);
      }
      return { totalDrift, results };
    },
    { connection, concurrency: 1 },
  );
}

async function notifySlack(
  url: string,
  total: number,
  rows: Array<{ name: string; count: number }>,
): Promise<void> {
  const failed = rows.filter((r) => r.count > 0);
  const body = {
    text: `:rotating_light: Multi-tenant drift detected — ${total} offending rows`,
    attachments: [
      {
        color: 'danger',
        fields: failed.map((f) => ({ title: f.name, value: String(f.count), short: true })),
      },
    ],
  };
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
```

**`services/worker/src/main.ts`** — add `startDriftAuditWorker(db)` alongside existing workers.

**`services/worker/src/config.ts`** — add `slackDriftWebhookUrl: process.env.SLACK_DRIFT_WEBHOOK_URL || ''`.

---

## Tests to add

### API

**`services/api/src/modules/audit/multi-tenant-drift.service.spec.ts`**

- `returns totalDrift=0 on a clean DB`
- `detects orphaned issue.reporter_id`
- `detects a user with two default memberships`
- `returns structured sample rows for failing checks`

Use the existing integration-test pattern (docker-compose postgres, migrations, seed a single org + user).

### Worker

**`services/worker/src/drift-audit/drift-audit.processor.spec.ts`**

- `processor runs all CHECKS and returns totalDrift`
- `does not call Slack when totalDrift=0`
- `calls Slack once when totalDrift>0`

Mock `fetch` globally with jest.

---

## Audit queries to run before and after deploy

Before (record baseline in runbook):

```sql
SELECT 'users' t, COUNT(*) FROM users
UNION ALL SELECT 'org_members', COUNT(*) FROM organization_members
UNION ALL SELECT 'invitations_table_exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='invitations') THEN 1 ELSE 0 END;
```

After (must match except for `invitations_table_exists` which is still 0 — not in this phase):

Same query. Counts unchanged.

---

## Completion criteria

- [ ] `GET /admin/audit/multi-tenant-drift` returns `{ totalDrift: 0 }` in production
- [ ] BullMQ job `drift-audit-hourly` appears in the queue list
- [ ] Worker logs show `[drift-audit] totalDrift=0` hourly
- [ ] Unit tests green
- [ ] No API error-rate regression (<0.1%)
- [ ] Staging soak ≥ 24h

---

## Rollback

Not required. Worst case, disable the repeatable job:

```bash
# SSH to prod, then in the worker container:
docker exec -it infra-bu-worker-1 sh -c 'node -e "
  const { Queue } = require(\"bullmq\");
  const q = new Queue(\"drift-audit\", { connection: { host: \"redis\", port: 6379 } });
  q.removeRepeatable(\"run\", { every: 3600000, immediately: true });
  q.close();
"'
```

The endpoint is read-only and harmless.

---

## Next

Once this is green in production, proceed to `phase-1-additive-schema.md`.

---

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

---

# Phase 1 — Additive Schema + Backfill

**Goal:** create the target shape alongside the old. Old code paths continue to work untouched; new columns/tables are populated but not yet read.

**Duration:** 1 day of engineering, plus ≥24h shadow-DB soak + canary org creation
**Deploys:** 1
**Prerequisites:**
- Phase 0 complete; drift audit showing `totalDrift=0` hourly for ≥3 days.
- **Phase 0.5 complete; data audit clean** (Invariants F + G = 0, no manual-review items pending).
- Shadow DB refreshed from latest prod snapshot and migration dry-run successful.
**Rollback:** migration `down()` drops the new objects. Data in old columns unchanged.

---

## v2 changes vs v1

- **Chunked backfills.** Every UPDATE touching `organization_members` batches in 1000-row chunks with commits between, so no single lock exceeds ~500ms.
- **`is_default=true` logic improved.** Uses a deterministic rule documented inline: matches `users.organization_id` first, else the membership with most-recent `created_at` as a proxy for "most recently joined" (we don't have `last_active_at` populated yet).
- **Canary org created in the same deploy** so Phase 2+ has a target ready.

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

    // ── 5. Backfill organization_members.is_active (CHUNKED 1000-rows) ──
    // Chunking keeps each UPDATE transaction under ~500ms so API latency
    // doesn't spike during the migration.
    await this.chunkedUpdate(q,
      `UPDATE organization_members m
          SET is_active = u.is_active
         FROM users u
        WHERE m.user_id = u.id
          AND u.is_active IS NOT NULL
          AND m.ctid = ANY(
            SELECT ctid FROM organization_members m2
             WHERE m2.is_active IS DISTINCT FROM (
               SELECT u2.is_active FROM users u2 WHERE u2.id = m2.user_id
             )
             LIMIT 1000
          )`,
    );

    // ── 6. Backfill organization_members.jira_account_id (CHUNKED) ──
    // Only the user's legacy home org gets the backfill; other orgs keep NULL
    // until an explicit Jira migration run for them.
    await this.chunkedUpdate(q,
      `UPDATE organization_members m
          SET jira_account_id = u.jira_account_id
         FROM users u
        WHERE m.user_id = u.id
          AND m.organization_id = u.organization_id
          AND u.jira_account_id IS NOT NULL
          AND m.jira_account_id IS NULL
          AND m.ctid = ANY(
            SELECT m2.ctid FROM organization_members m2
             JOIN users u2 ON u2.id = m2.user_id
            WHERE m2.organization_id = u2.organization_id
              AND u2.jira_account_id IS NOT NULL
              AND m2.jira_account_id IS NULL
            LIMIT 1000
          )`,
    );

    // ── 7. Backfill is_default ──────────────────────────────────────────
    // Priority:
    //   a) Matches users.organization_id (user's legacy "home" org)
    //   b) Otherwise: oldest membership (deterministic tiebreak)
    //
    // Invariant we must preserve: exactly one is_default=true per user.
    // The UNIQUE partial index (uq_org_members_user_default) enforces this
    // at the DB level, so we must apply updates in two passes to avoid a
    // constraint violation during the transition.

    // 7a. Reset all is_default to false first (idempotent; safe if empty).
    await this.chunkedUpdate(q,
      `UPDATE organization_members
          SET is_default = false
        WHERE is_default = true
          AND ctid = ANY(
            SELECT ctid FROM organization_members
             WHERE is_default = true LIMIT 1000
          )`,
    );

    // 7b. Set is_default=true for the canonical home org membership.
    //    Uses a single atomic statement that picks the "best" membership
    //    per user (home org > oldest) so we never exceed one per user.
    await q.query(`
      WITH ranked AS (
        SELECT m.user_id,
               m.organization_id,
               ROW_NUMBER() OVER (
                 PARTITION BY m.user_id
                 ORDER BY
                   (CASE WHEN m.organization_id = u.organization_id THEN 0 ELSE 1 END),
                   m.created_at ASC
               ) AS rnk
          FROM organization_members m
          JOIN users u ON u.id = m.user_id
      )
      UPDATE organization_members m
         SET is_default = true
        FROM ranked r
       WHERE m.user_id = r.user_id
         AND m.organization_id = r.organization_id
         AND r.rnk = 1
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

  /**
   * Run `sql` repeatedly until no rows are affected. `sql` MUST include a
   * LIMIT (or ctid-IN trick as shown) so each iteration touches at most
   * ~1000 rows. Commits between iterations by virtue of being outside
   * the outer migration transaction — TypeORM migrations run in a single
   * transaction by default, so we force autocommit here by calling
   * q.query() with explicit COMMIT/BEGIN pairs.
   */
  private async chunkedUpdate(q: QueryRunner, sql: string, maxIterations = 10_000): Promise<void> {
    // We're inside a transaction — release it so each chunk commits
    // independently. If migration fails mid-backfill, already-committed
    // chunks are fine (idempotent WHERE clauses guarantee re-running is a no-op).
    await q.commitTransaction();
    try {
      for (let i = 0; i < maxIterations; i++) {
        await q.startTransaction();
        const result = await q.query(sql);
        const rowCount = result?.[1] ?? (Array.isArray(result) ? result.length : 0);
        await q.commitTransaction();
        if (rowCount === 0) return;
      }
      throw new Error(`chunkedUpdate exceeded ${maxIterations} iterations — did the WHERE clause exclude processed rows?`);
    } finally {
      await q.startTransaction(); // Resume outer tx so remaining migration steps stay transactional.
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

---

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

---

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

---

# Phase 4 — Freeze Legacy Writes + Soak

**Goal:** stop writing the legacy columns. New-shape is authoritative. Old columns remain in the schema as a safety net for one week of soak; if anything regresses, re-enable dual-write instantly.

**Duration:** 3 days of engineering + 1 week soak
**Deploys:** 1 (+ flag flip)
**Prerequisites:** Phase 3 complete; every read flag on for ≥72h; drift audit 0 for ≥7 days.
**Rollback:** `DUAL_WRITE_LEGACY_SHAPE=true` → dual-write resumes; new writes repopulate old columns.

---

## What changes

1. Every dual-write branch from Phase 2 is gated behind `DUAL_WRITE_LEGACY_SHAPE` (already wired in Phase 2 config).
2. Default the flag to `false` in `.env` and `.env.example`.
3. Add a "legacy column access" logger that warns if any code path READS the legacy columns during the soak. Helps catch consumers we missed.

---

## Code changes

### Config

`services/api/src/config/configuration.ts`:

```typescript
dualWriteLegacyShape: process.env.DUAL_WRITE_LEGACY_SHAPE === 'true',  // default false from Phase 4
```

Worker config mirrors this.

### Legacy-read access logging

Add a thin middleware/interceptor that logs any DB query referencing the about-to-be-dropped columns. Pure observability — it doesn't block reads.

`services/api/src/common/interceptors/legacy-access.interceptor.ts`:

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';

const LEGACY_COLUMNS = [
  'users.organization_id',
  'users.role',
  'users.is_active',
  'users.invitation_status',
  'users.jira_account_id',
  'users.email_verification_token',
  'users.email_verification_expiry',
  'users.pending_invite_organization_id',
];

@Injectable()
export class LegacyAccessInterceptor implements NestInterceptor {
  private readonly logger = new Logger('LegacyAccess');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle();
  }
}
```

A more useful approach: hook TypeORM's logger. Add to `data-source.ts`:

```typescript
logging: ['query', 'error'],
logger: {
  logQuery(query, params) {
    if (process.env.LEGACY_ACCESS_LOG !== 'true') return;
    for (const col of LEGACY_COLUMNS) {
      if (query.includes(col)) {
        console.warn(`[legacy-access] ${col} referenced in query: ${query.slice(0, 200)}`);
        return;
      }
    }
  },
  logQueryError() {}, logQuerySlow() {}, logSchemaBuild() {}, logMigration() {}, log() {},
}
```

Enable `LEGACY_ACCESS_LOG=true` in prod during the soak; grep Grafana/CloudWatch for hits. Disable before Phase 5.

### Call sites

Every `if (this.flags.dualWriteLegacyShape) { /* write to users.X */ }` block — nothing needs to change except turning the flag off, because we wrote them behind a flag in Phase 2.

If you find any Phase-2 dual-write NOT behind the flag, wrap it now. Run `grep -rn "users.role =" services/api/src/` — every hit should already be inside a flag check.

### Jira migration worker

Same: the legacy `users.jira_account_id` write becomes flag-gated. With the flag off, only `organization_members.jira_account_id` gets written.

---

## Tests

- No new unit tests strictly required; the legacy-off paths are covered by existing Phase 2 tests with the flag toggled.
- **Integration smoke:** with `DUAL_WRITE_LEGACY_SHAPE=false`, run every scenario from the design doc §2 and assert:
  - `organization_members` always updated
  - `users` legacy columns unchanged (no writes)

One new test file:

`services/api/src/modules/organizations/organizations.service.legacy-frozen.spec.ts`

```typescript
it('invite new user does not write users.email_verification_token when flag is off', async () => {
  process.env.DUAL_WRITE_LEGACY_SHAPE = 'false';
  const userBefore = await userRepo.findOne({ where: { email: 'test@example.com' } });
  // ...invite flow...
  const userAfter = await userRepo.findOne({ where: { email: 'test@example.com' } });
  expect(userAfter?.emailVerificationToken).toBe(userBefore?.emailVerificationToken ?? null);
  // invitations table should have the new row
  const invite = await invitationsRepo.findOne({ where: { email: 'test@example.com' } });
  expect(invite?.status).toBe('pending');
});
```

Repeat for: role change, deactivate, revoke invite, Jira user upsert.

---

## Deployment procedure

1. Ship the code change that defaults `DUAL_WRITE_LEGACY_SHAPE=false`
2. Flip the production `.env`:
   ```bash
   ssh prod "sed -i 's/^DUAL_WRITE_LEGACY_SHAPE=.*/DUAL_WRITE_LEGACY_SHAPE=false/' /home/ubuntu/infra/.env"
   ssh prod "cd /home/ubuntu/infra && docker compose up -d bu-api bu-worker"
   ```
3. Enable legacy-access logging:
   ```bash
   ssh prod "sed -i 's/^LEGACY_ACCESS_LOG=.*/LEGACY_ACCESS_LOG=true/' /home/ubuntu/infra/.env"
   ssh prod "docker compose up -d bu-api"
   ```
4. Tail logs for 24h. Any `[legacy-access]` warnings surface consumers we missed. Fix them under the same flag structure before continuing.

---

## Audit during soak

Run hourly, alert on non-zero:

```sql
-- A. Legacy columns should not have received a value-update in the last hour.
--    (created_at / updated_at changes are OK; we check column-level via audit_logs.)
-- Skip direct checks; rely on the LEGACY_ACCESS_LOG output.

-- B. Every invite created in the last hour is in invitations table, not users table
SELECT COUNT(*) FROM invitations
 WHERE invited_at > NOW() - INTERVAL '1 hour' AND status = 'pending';
-- Compared against any users.email_verification_token updates in the same window (should be 0 via logs).

-- C. Every role change in the last hour is on organization_members
--    Check audit_logs for 'organization.member.role_changed' events; confirm membership.updated_at
--    changed but users.updated_at didn't (for the role field specifically).
```

The drift audit from Phase 2 should still return 0 — any non-zero value here means someone's writing the legacy shape but not the new one, which means a missed call site.

---

## Completion criteria

- [ ] `DUAL_WRITE_LEGACY_SHAPE=false` in prod for ≥1 week
- [ ] Zero `[legacy-access]` warnings in logs for the last 48h of the soak
- [ ] Drift audit: 0 for the full soak window
- [ ] No P1/P0 bugs reported
- [ ] Support inbox: zero tickets related to "can't log in", "wrong workspace", "invite failed"

---

## Rollback

```bash
ssh prod "sed -i 's/^DUAL_WRITE_LEGACY_SHAPE=.*/DUAL_WRITE_LEGACY_SHAPE=true/' /home/ubuntu/infra/.env"
ssh prod "docker compose up -d bu-api bu-worker"
```

Dual-write resumes instantly. Data catches up within seconds (Phase 2's writes were lossless — we never lost them, just stopped writing).

Then investigate the regression, hotfix, and re-attempt the freeze.

---

## Next

Phase 5 — drop legacy columns. Only proceed after the 1-week soak is clean.

---

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

---

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

---

# Rollback Drill Log

# Rollback Drill Log

Every phase's rollback command is executed on the shadow DB BEFORE that phase ships to production. This log records each drill.

| Date | Phase | Drill | Operator | Outcome | Notes |
|---|---|---|---|---|---|
| _(first entry populated during Phase 0)_ | | | | | |

## Drill procedure template

1. Shadow DB refreshed from latest prod snapshot (if not already)
2. Run the phase's `up()` migration on shadow
3. Verify expected post-state (row counts, new objects, etc.)
4. Execute the documented rollback sequence verbatim
5. Verify shadow now matches pre-phase state (compare counts, spot-check rows)
6. Append entry to the table above with:
   - Date (ISO)
   - Phase (e.g., "Phase 1")
   - Drill type (up-then-down / feature-flag-flip / snapshot-restore)
   - Operator name
   - Outcome (Pass / Fail — Fail means the rollback needed manual fixes, which must be documented)
   - Notes (anything unexpected, timing, edge cases discovered)

## Why this matters

Every Apr 2026 cross-org bug was a "this should never happen" case that happened. Rollback procedures are exactly the same: the one you never drill is the one that fails on the night you need it.
