# Per-Org Membership Redesign

**Date:** 2026-04-21
**Status:** Proposed — not yet scheduled
**Effort estimate:** 2–3 days focused work + careful QA

## Problem

The `users` table today conflates **identity** (email, password, 2FA, avatar) with **membership** (which org, what role, active-or-not). This breaks several real scenarios:

1. **Cross-org Jira migration.** A user who signed up in Org X, then gets re-imported via a Jira migration into Org Y, ends up with their `users.organization_id` still pointing at Org X. Their membership in Org Y only exists via `organization_members`, but other code paths that read `user.organization_id` treat them as Org-X-only.
2. **Same user, different roles per org.** Alice is Admin in Org X and Member in Org Y. Today `users.role` is a single column — can't be both.
3. **Per-org deactivation.** Deactivating a user sets `users.is_active = false` globally, locking them out of every org. A user fired from Org X but still active in Org Y gets locked out of everything.
4. **Re-invite after deactivate.** If you deactivate someone and try to re-invite them in the same org (or a different one), the global flag blocks it until a manual cleanup.
5. **Jira migration hard-reject on duplicate emails.** One person with two Atlassian accounts → one collides on `UNIQUE (email)`, the other silently drops. Worked around with dedup in the short-term fix; the right fix is per-org membership rows so both can coexist without sharing an identity row.
6. **Invitation revoke fails on FK.** Revoking invitation tries to `DELETE FROM users` and hits `FK_issues_reporter_id` when the invited user was already a Jira reporter. Should revoke the MEMBERSHIP, not the identity.

## Target schema

```
users                          ← identity, one row per person, shared across orgs
  id               uuid PK
  email            varchar(255) UNIQUE NOT NULL
  password_hash    varchar(255)
  display_name     varchar(255) NOT NULL         ← personal, not per-org
  avatar_url       text
  timezone         varchar(100)
  language         varchar(10)
  email_verified   boolean
  oauth_provider   varchar(50)
  oauth_id         varchar(255)
  two_fa_enabled   boolean
  two_fa_secret    text
  backup_codes     text[]
  last_login_at    timestamptz
  failed_login_attempts int
  locked_until     timestamptz
  created_at, updated_at timestamptz

organization_members           ← membership + all per-org state
  user_id          uuid (FK users.id ON DELETE CASCADE)
  organization_id  uuid (FK organizations.id ON DELETE CASCADE)
  PRIMARY KEY (user_id, organization_id)
  role             varchar(50)  NOT NULL     ← admin | manager | member | viewer
  is_active        boolean      NOT NULL DEFAULT true
  invitation_status varchar(20) NOT NULL DEFAULT 'none' ← none | pending | accepted | revoked
  jira_account_id  varchar(255)              ← per-org Atlassian mapping
  invited_by       uuid (FK users.id)
  invited_at       timestamptz
  accepted_at      timestamptz
  deactivated_at   timestamptz
  is_default       boolean      NOT NULL DEFAULT false ← for "home org" UX
  notification_preferences jsonb
  created_at, updated_at timestamptz
  INDEX (organization_id, invitation_status)
  INDEX (organization_id, is_active)
  UNIQUE (organization_id, jira_account_id) WHERE jira_account_id IS NOT NULL
```

### What moves off `users`

| Column | Old location | New location | Notes |
|---|---|---|---|
| `organization_id` | `users` | N/A — derived from `organization_members` | "primary org" comes from `is_default=true` |
| `role` | `users` | `organization_members.role` | Per-org now |
| `is_active` | `users` | `organization_members.is_active` | Per-org now; login checks membership |
| `invitation_status` | `users` | `organization_members.invitation_status` | Per-org now |
| `jira_account_id` | `users` | `organization_members.jira_account_id` | Per-org — one person may have different Atlassian IDs per Jira instance |
| `notification_preferences` | `users` | Split: personal prefs stay, per-org digest prefs move | |

### What stays on `users`

Everything identity/auth: email, password_hash, display_name, avatar_url, oauth_*, two_fa_*, last_login_at, locked_until, email_verified.

## Semantics

### Login
- Lookup `users.email` → unique match.
- Fetch `organization_members` where `user_id = ? AND is_active = true AND invitation_status IN ('none','accepted')`.
- If zero active memberships → "Your account is not active in any workspace. Contact an admin."
- If one → auto-select as session org.
- If multiple → user picks (the SSO UX you already have).
- JWT payload: `{ sub: userId, org: organizationId, role }` where `role` comes from the selected membership row, not `users`.

### Registration
- Create `users` row.
- Create default `organization_members` row with `is_default=true, role='owner', is_active=true`.

### Invite flow
- Admin invites `alice@acme.com` into Org Y:
  - If `users` row exists → just insert `organization_members(user_id, org_y, role, invitation_status='pending')`.
  - If not → create `users` row (password_hash NULL) + the membership row.
  - Invite email sent regardless. Accepting the invite flips `invitation_status='accepted'`, not `is_active`.

### Deactivation
- Admin deactivates Alice in Org X:
  - `UPDATE organization_members SET is_active=false, deactivated_at=NOW() WHERE user_id=? AND organization_id=?`
  - Alice's `users.last_login_at` etc. is untouched.
  - Alice can still log in to Org Y if she has an active membership there.
- Re-invite to Org X: flip `is_active=true` again, same row.

### Revoke invitation
- `UPDATE organization_members SET invitation_status='revoked', is_active=false WHERE ...`.
- **Never delete the users row** — it may be referenced by `issues.reporter_id`, `comments.author_id`, etc.
- If the revoked user has no other active memberships and has never logged in, a background job can eventually clean up the orphan `users` row — but only after checking all FK references.

### Jira migration
- Phase 1 upserts `users` by email (identity only).
- For each user imported, inserts/updates `organization_members(user_id, current_org, invitation_status='pending', is_active=false, jira_account_id=?)`.
- Cross-org re-migrations become trivial — no global conflicts, no silent drops.
- Dedup-by-email in the bulk insert is still needed inside a single migration (Jira occasionally returns the same email twice), but cross-org conflicts disappear entirely.

### Deleting a user (hard delete)
- Admin-only, and only allowed if the user has never participated (no issues authored, no comments, etc.). Otherwise soft-delete via deactivation only.
- `DELETE FROM users WHERE id=?` → CASCADE kills all memberships, refresh tokens, notifications. FK violations on `issues.reporter_id` etc. mean the delete is rejected; UI shows "user has historical activity — deactivate instead."

## Migration strategy (zero-downtime)

This is a sizable data migration — do it in four phases across multiple deploys.

### Phase 1: additive schema
- Add new columns to `organization_members`: `invitation_status`, `is_active`, `jira_account_id`, `invited_by`, `invited_at`, `accepted_at`, `deactivated_at`.
- Backfill from `users` in the same transaction:
  ```sql
  UPDATE organization_members m
  SET invitation_status = u.invitation_status,
      is_active         = u.is_active,
      jira_account_id   = u.jira_account_id
  FROM users u
  WHERE m.user_id = u.id AND m.organization_id = u.organization_id;
  ```
- `users` columns stay — still source of truth. No code changes yet.

### Phase 2: dual-write
- Every write that touches `users.is_active`, `.role`, `.invitation_status`, `.jira_account_id` also writes to the matching `organization_members` row.
- Reads still use `users`. Deploy this, let it run for a few days, audit that the two are never out of sync.

### Phase 3: flip reads
- One PR per consumer: switch reads from `users.X` to `organization_members.X` (scoped to the request's org context).
- Call sites to update (non-exhaustive, from a grep): auth guards, RBAC service, members list endpoint, invite endpoint, revoke endpoint, deactivate endpoint, Jira migration processor, organization service, notification digest picker.
- Every PR adds a test that covers the per-org semantics for that consumer.

### Phase 4: drop legacy columns
- Remove the old columns from `users`.
- Remove the backfill triggers.
- Final schema matches the target above.

## Risk register

| Risk | Mitigation |
|---|---|
| Consumer read-flip misses a call site → stale data used | Mark old columns `DEPRECATED` with a comment; grep CI check fails on new refs |
| Dual-write drift | Daily audit query comparing `users.*` vs `organization_members.*`; alert on mismatch |
| JWT includes stale role after org switch | Invalidate JWT on org switch; session cookie stores `orgId`, role re-fetched each request |
| Long-running migrations in Phase 1 backfill | Run backfill in chunks of 1000 rows with commits between |
| Rollback mid-Phase 3 | Each flip PR is independently revertible; Phase 2 dual-write keeps `users` valid |

## Out of scope (for this design)

- Multi-tenant row-level security policies in Postgres (separate effort).
- Email uniqueness relaxation (`users.email` stays globally unique — one identity per email across the platform).
- SCIM provisioning (later).

## References

- Jira: each user is a global Atlassian account; per-site membership controls access and group memberships.
- Linear: same pattern — one user record, many workspace memberships.
- Notion: same pattern.
- Slack: single Slack user, many workspace memberships with per-workspace roles.

All of them model this as the design above. Boardupscale currently does not — the redesign brings us in line with the category standard.
