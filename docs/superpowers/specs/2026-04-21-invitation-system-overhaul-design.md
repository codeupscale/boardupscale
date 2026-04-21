# Invitation System Overhaul — Design Spec

**Date:** 2026-04-21
**Status:** Approved
**Scope:** Fix invalid-invite errors for Jira-migrated users, add `invitation_status` state machine, atomic merge confirmation, project auto-assignment at import, re-invite UI, and distinct error pages.

---

## Problem Statement

Jira-migrated users are created with `isActive: true` (they were active in Jira). When an admin later provides their real email and sends an invite, the invitation validation checks `user.isActive === false` and immediately rejects with "Invalid Invitation — already been accepted." The underlying cause is that `isActive` is overloaded — it means both "pending invite" and "deactivated account," with no representation for the "migrated, awaiting real email" state. Additional gaps: no re-invite UI, no atomic merge transaction, no project membership at import time, and a single generic error screen for all invite failure modes.

---

## Approach

**Approach B — Add `invitation_status` enum.** Decouple invitation state from `isActive` with a dedicated column. Fix all invite flows, merge confirmation, project auto-assignment, and UI on top of this clean foundation.

---

## Section 1 — Data Model

### New column: `invitation_status` on `users`

| Value | Meaning |
|---|---|
| `none` | Jira-migrated user, no invite sent yet |
| `pending` | Invite sent, awaiting acceptance |
| `accepted` | User activated (set password or OAuth) |
| `expired` | Token expired without acceptance |

**Migration:**
- Add `invitation_status VARCHAR(20) NOT NULL DEFAULT 'none'` to `users`
- Backfill: `isActive = true` → `accepted`, `isActive = false` → `pending`
- Jira-migrated users with `email LIKE '%@migrated.jira.local'` → `none`
- Add index on `(organization_id, invitation_status)` for member list filtering

**`isActive` is retained** — it controls authentication access. The two fields have distinct responsibilities:
- `isActive`: can this account authenticate?
- `invitation_status`: where is this user in the onboarding funnel?

### State transitions

```
none ──(admin provides email)──► pending ──(user accepts)──► accepted
                                     │
                           (token expires, 7d)
                                     ▼
                                  expired ──(resend)──► pending
```

### Edge cases

- OAuth/SAML users: created directly as `accepted`, no invite flow
- Existing `accepted` user invited to a second org: skip token, add `organization_members` row, send "you've been added" email
- Jira user with real email at import: `isActive = false`, `invitation_status = 'pending'`, invite sent immediately
- Jira user with no email at import: `isActive = true`, `invitation_status = 'none'`, no invite until admin provides email
- Token replaced on resend: status stays `pending`, old token invalidated by overwrite

---

## Section 2 — Backend State Machine

### `validateInvitation`

Replace `user.isActive === false` check with:
```
invitation_status IN ('pending', 'expired') AND emailVerificationToken matches
```

Return distinct error codes:
- `INVITE_ALREADY_ACCEPTED` — `invitation_status = 'accepted'`
- `INVITE_NOT_SENT` — `invitation_status = 'none'`
- `INVITE_EXPIRED` — token TTL passed; set `invitation_status = 'expired'` on detection
- `INVITE_INVALID` — token not found / hash mismatch

### `acceptInvitation`

On success:
- Set `isActive = true`
- Set `invitation_status = 'accepted'`
- Clear `emailVerificationToken` + `emailVerificationExpiry`
- Set `emailVerified = true` (accepting an invite IS email verification)
- Auto-upsert `organization_members` row if missing

### Invite send / resend

**New invite — fresh email:**
- New user: `isActive = false`, `invitation_status = 'pending'`
- Already `accepted` user: skip token entirely, add org membership, send "you've been added" email

**Resend** (`POST /organizations/me/members/:memberId/resend-invite`):
- Allow for `invitation_status IN ('pending', 'expired')` — current code only allows `isActive = false`
- Generate fresh token, reset expiry to 7 days, set `invitation_status = 'pending'`

**Jira migration — real email at import:**
- `isActive = false`, `invitation_status = 'pending'`, send invite immediately

**Jira migration — no email at import:**
- `isActive = true`, `invitation_status = 'none'`
- `isActive = true` so assignee dropdowns and issue history work before invite is sent

**`updateMigratedMemberEmail` (admin provides real email):**
- Set `isActive = false`
- Set `invitation_status = 'pending'`
- Generate + send invite token
- If email already exists → return `HTTP 409` with merge preview payload

### Revoke invitation

- Only allowed for `invitation_status IN ('pending', 'expired', 'none')`
- `accepted` users must be deactivated via a separate flow — revoke is not applicable

### Edge cases

| Scenario | Behaviour |
|---|---|
| User clicks expired link | `INVITE_EXPIRED` + "Ask your admin to resend" |
| User clicks old link after resend | Token mismatch → `INVITE_INVALID` |
| User clicks link twice | `INVITE_ALREADY_ACCEPTED` → "Go to Login" |
| OAuth user invited to second org | Already `accepted` → direct membership, no token |
| Admin resends to expired user | Resets to `pending`, fresh 7-day window |
| Jira user accepted in one org, invited to another | Already `accepted` → direct membership add |

---

## Section 3 — Merge Confirmation Flow

### New endpoint: `GET /organizations/me/members/:memberId/merge-preview`

Returns impact summary before any data moves:

```json
{
  "placeholder": { "id": "...", "displayName": "Awais M", "email": "jira-xxx@migrated.jira.local" },
  "targetUser": { "id": "...", "displayName": "Awais Malik", "email": "awais@company.com" },
  "impact": {
    "issuesReassigned": 47,
    "commentsReassigned": 12,
    "projectMemberships": 3,
    "worklogsReassigned": 8,
    "watchersReassigned": 5
  },
  "conflict": false
}
```

If `targetUser` is already a member of this org → `"conflict": true` with details.

### Updated `PATCH /organizations/me/members/:memberId/email`

Accepts `{ email: string, confirmMerge?: boolean }`:
- Email is new → update directly
- Email exists + `confirmMerge` not `true` → `HTTP 409` with merge preview payload
- Email exists + `confirmMerge: true` → execute merge

### Atomic transaction

The entire merge is a single DB transaction:

```
BEGIN
  1. Reassign issues (assignee_id, reporter_id) scoped to organizationId
  2. Reassign comments (author_id) scoped to organizationId
  3. Reassign work logs scoped to organizationId
  4. Reassign issue watchers scoped to organizationId
  5. Reassign project_members rows scoped to organizationId
  6. Copy jiraAccountId to target if not already set
  7. Delete placeholder organization_members row
  8. Delete placeholder user (if no other org memberships remain)
  9. Upsert target user into organization_members
  10. Set target invitation_status = 'pending', isActive = false (if not already accepted)
  11. Generate + send invite token
  12. Write audit log: organization.member.merged { placeholderId, targetUserId, impact }
COMMIT — or full ROLLBACK on any failure
```

### Audit log entry

```json
{
  "event": "organization.member.merged",
  "triggeredBy": "admin-user-id",
  "organizationId": "...",
  "data": {
    "placeholderUserId": "...",
    "placeholderEmail": "jira-xxx@migrated.jira.local",
    "targetUserId": "...",
    "targetEmail": "awais@company.com",
    "issuesReassigned": 47,
    "commentsReassigned": 12,
    "projectMembershipsTransferred": 3,
    "worklogsReassigned": 8,
    "watchersReassigned": 5
  }
}
```

### Edge cases

| Scenario | Behaviour |
|---|---|
| Target email exists, same org | Conflict detected, preview shown, `confirmMerge` required |
| Target email exists, different org | Merge proceeds, target added to this org |
| Target user already `accepted` | Skip invite flow, transfer data + add org membership |
| Transaction fails mid-merge | Full rollback, no partial state |
| Admin provides synthetic email as real | Blocked — new email must not end with `@migrated.jira.local` |
| Admin provides their own email | Blocked — cannot merge placeholder into org owner/admin |
| Merge triggered twice (double-click) | Second call finds placeholder deleted → 404, idempotent |

---

## Section 4 — Project Auto-Assignment at Jira Import

### Timing

After Phase 1 (users upserted) and before Phase 2 (issues migrated): new **Phase 1b — Project Member Sync**.

Order: Phase 1 → Phase 1b → Phase 2. This ensures users exist before project memberships, and project memberships exist before issues (RBAC correct from day one).

### Inference logic

For each Jira project being migrated, collect the union of all `accountId`s that appear as assignee or reporter across that project's issues. Map each to `userId` via `jira_account_id`. Insert into `project_members` with role derived from `state.roleMapping`.

```
for each project in migration:
  accountIds = DISTINCT(assignee_ids + reporter_ids from Jira issues)
  for each accountId:
    userId = users WHERE jira_account_id = accountId AND organization_id = orgId
    INSERT INTO project_members (project_id, user_id, role)
    VALUES (project.id, userId, mappedRole)
    ON CONFLICT (project_id, user_id) DO NOTHING
```

### Role mapping

| Org role | Project role |
|---|---|
| `admin` | `admin` |
| `manager` | `manager` |
| `member` | `member` |
| `viewer` | `viewer` |

### Progress events

Phase 1b emits BullMQ progress: `{ phase: 'project_member_sync', processed, total, projectsProcessed, projectsTotal }`. Frontend migration UI already consumes progress events — no frontend changes needed.

### Belt-and-suspenders: post-accept sync

On `acceptInvitation`, enqueue a lightweight background job `SyncProjectMembershipsJob(userId, organizationId)`. Idempotent — if Phase 1b ran correctly it exits immediately. Catches any gaps from interrupted migrations.

### Edge cases

| Scenario | Behaviour |
|---|---|
| User had activity in 5 projects | Added to all 5 |
| Migration re-run / partial retry | `ON CONFLICT DO NOTHING` — idempotent |
| User has no issue activity | Not added — admin adds manually |
| User accepts invite before Phase 1b | Post-accept sync job catches any gaps |
| Project membership already exists | `ON CONFLICT DO NOTHING` — no duplicate |

---

## Section 5 — Frontend Changes

### 5a — Team Page: status badges + re-invite UI

Member row badge driven by `invitation_status` from API:

| Status | Badge | Available actions |
|---|---|---|
| `accepted` | Active (green) | Remove from org |
| `pending` | Invite Pending (amber) | Resend Invite, Revoke |
| `expired` | Invite Expired (red) | Resend Invite, Revoke |
| `none` | Migrated (no email) (amber) | Add Email |

**Resend Invite**: single click, success toast *"Invite resent to email@company.com"*. Button disabled during request.

**Revoke**: inline confirmation *"This will remove [Name] and they won't be able to join. Are you sure?"*

Replace all `isActive`-based status derivation in `TeamPage.tsx` with `invitation_status`.

### 5b — Merge Confirmation Modal

Triggered when `PATCH /email` returns `HTTP 409`:

```
┌──────────────────────────────────────────────┐
│  Merge Accounts                           ×  │
│                                              │
│  The email awais@company.com already         │
│  belongs to an existing member.              │
│                                              │
│  Merging will transfer all activity from     │
│  Awais M (Jira placeholder) to this account. │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  47 issues · 12 comments             │   │
│  │  3 project memberships · 8 worklogs  │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  This cannot be undone.                      │
│                                              │
│  [Cancel]           [Confirm Merge →]        │
└──────────────────────────────────────────────┘
```

- Impact numbers from `merge-preview` endpoint, called on 409 receipt
- Confirm calls `PATCH /email` with `confirmMerge: true`
- Loading state on button during merge
- On success: close modal, toast *"Accounts merged. Invitation sent to awais@company.com"*
- On error: inline error, modal stays open

### 5c — Accept Invite Page error states

| Error code | Heading | Body | CTA |
|---|---|---|---|
| `INVITE_ALREADY_ACCEPTED` | Already Accepted | Your account is already active. | Go to Login |
| `INVITE_EXPIRED` | Invite Expired | This invite expired after 7 days. Ask your admin to resend it. | Go to Login |
| `INVITE_INVALID` | Invalid Link | This invite link is invalid or has already been used. | Go to Login |
| `INVITE_NOT_SENT` | No Invite Sent | Your admin hasn't sent an invitation yet. Contact them to get access. | — |

### 5d — Edge cases

| Scenario | Behaviour |
|---|---|
| Admin double-clicks Resend | Button disabled during request |
| Merge preview fetch fails | "Unable to load merge details, try again" inside modal |
| Expired badge on load | Derived from `invitation_status` from API — no client-side date math |
| 0 pending members | No resend/revoke UI shown |

---

## Files Affected

| File | Change |
|---|---|
| `migrations/XXXXXX-add-invitation-status.ts` | New migration — add column, backfill, index |
| `users/entities/user.entity.ts` | Add `invitationStatus` field |
| `auth/auth.service.ts` | Update `validateInvitation`, `acceptInvitation` |
| `organizations/organizations.service.ts` | Update `inviteMember`, `resendInvitation`, `revokeInvitation`, `updateMigratedMemberEmail`, `mergeAndInviteExistingUser` — wrap merge in transaction |
| `organizations/organizations.controller.ts` | Add `GET /members/:id/merge-preview` endpoint |
| `worker/jira-migration.processor.ts` | Add Phase 1b project member sync, fix user creation flags |
| `worker/jobs/sync-project-memberships.job.ts` | New post-accept idempotent sync job |
| `web/src/pages/TeamPage.tsx` | Replace `isActive` with `invitation_status`, add resend/revoke UI |
| `web/src/pages/AcceptInvitePage.tsx` | Distinct error states per error code |
| `web/src/components/MergeConfirmationModal.tsx` | New modal component |
