# Jira Member Reconciliation — Design Spec

**Goal:** Fix all broken scenarios where Jira-migrated members cannot see their projects, have no project memberships, or were never sent an invitation email. Prevent the root causes from recurring on future migrations.

**Architecture:** Changes are confined to `organizations.service.ts`, `auth.service.ts`, `jira-migration.processor.ts`, one new TypeORM migration, and three new controller endpoints. No new tables. No frontend changes required beyond the API contract additions.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL 15, BullMQ worker

---

## Problem Statement

Four distinct failure scenarios exist after a Jira migration:

| ID | Scenario | Root Cause |
|----|----------|------------|
| S1 | Jira user imported with synthetic email (`jira-XXX@migrated.jira.local`) → admin invites real email → **merge dialog skipped** → new user created with no `project_members` | `inviteMember()` allows creating a fresh user even when Jira placeholders exist in the org |
| S2 | Jira user imported with real email (`is_active=false`) → admin invites same email → user accepts → blank project list | `project_members` rows exist but `organization_members` lookup may fail; `repairOrgMemberships` never called |
| S3 | Real-email migrated users sit with `invitation_status='pending'` forever — no invite email was ever sent by the migration | Migration creates user records but never sends emails; admin must invite one-by-one |
| S4 | Any active user in `organization_members` with `role='member'` but zero `project_members` rows sees an empty board | `getProjects` does `INNER JOIN project_members` — no rows = no results, no fallback |

---

## Changes

### 1. Database Migration (`1744500000000-JiraMemberReconciliation.ts`)

**Additive only — no column drops, no table drops.**

- `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_jira_account_id" ON "users" ("jira_account_id") WHERE "jira_account_id" IS NOT NULL` — enables fast merge lookups by Jira accountId
- `CREATE INDEX IF NOT EXISTS "IDX_project_members_user_id" ON "project_members" ("user_id")` — speeds up the repair query that finds all projects for a user
- `down()` drops both indexes

---

### 2. `organizations.service.ts`

#### 2a. `inviteMember()` — block merge-skipping

**Current behaviour:** When no user exists with the invited email, a fresh user is created unconditionally.

**New behaviour:**
1. Before creating a new user, query for synthetic placeholders in the same org:
   ```sql
   SELECT id, display_name, email
   FROM users
   WHERE organization_id = $orgId
     AND email LIKE '%@migrated.jira.local'
   LIMIT 20
   ```
2. If any exist **and** `dto.forceCreate !== true` → throw `HttpException` with status `409` and body:
   ```json
   {
     "code": "JIRA_MERGE_REQUIRED",
     "message": "This organisation has Jira placeholder users. Select a placeholder to merge with, or pass forceCreate:true to add a new member.",
     "placeholders": [{ "id": "...", "displayName": "...", "email": "jira-xxx@..." }]
   }
   ```
3. If `dto.forceCreate === true` → proceed with fresh user creation (explicit admin choice).
4. If no placeholders exist → proceed as before.

**DTO change:** Add `forceCreate?: boolean` (default `false`) to `InviteMemberDto`.

---

#### 2b. `repairOrgMemberships(orgId: string): Promise<RepairResult>`

New public method. Runs three idempotent SQL statements in a single transaction:

**Step 1 — Ensure org_members for all project_members:**
```sql
INSERT INTO organization_members (id, user_id, organization_id, role, is_default, created_at, updated_at)
SELECT
  gen_random_uuid(),
  pm.user_id,
  p.organization_id,
  COALESCE(u.role, 'member'),
  false,
  NOW(),
  NOW()
FROM project_members pm
JOIN projects p ON p.id = pm.project_id
JOIN users u ON u.id = pm.user_id
WHERE p.organization_id = $1
  AND NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.user_id = pm.user_id AND om.organization_id = p.organization_id
  )
ON CONFLICT (user_id, organization_id) DO NOTHING
```

**Step 2 — Re-sync assignee/reporter → project_members:**
```sql
INSERT INTO project_members (id, project_id, user_id, role, created_at, updated_at)
SELECT gen_random_uuid(), i.project_id, i.assignee_id, 'member', NOW(), NOW()
FROM issues i
JOIN projects p ON p.id = i.project_id AND p.organization_id = $1
WHERE i.assignee_id IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;

INSERT INTO project_members (id, project_id, user_id, role, created_at, updated_at)
SELECT gen_random_uuid(), i.project_id, i.reporter_id, 'member', NOW(), NOW()
FROM issues i
JOIN projects p ON p.id = i.project_id AND p.organization_id = $1
WHERE i.reporter_id IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;
```

**Step 3 — Re-sync comment authors → project_members:**
```sql
INSERT INTO project_members (id, project_id, user_id, role, created_at, updated_at)
SELECT gen_random_uuid(), i.project_id, c.author_id, 'member', NOW(), NOW()
FROM comments c
JOIN issues i ON i.id = c.issue_id
JOIN projects p ON p.id = i.project_id AND p.organization_id = $1
WHERE c.author_id IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;
```

Returns `{ repairedOrgMembers: number, repairedProjectMembers: number }`.

---

#### 2c. `bulkInvitePending(orgId: string): Promise<BulkInviteResult>`

New public method:
1. Query all users in org with `invitation_status = 'pending'` and `email NOT LIKE '%@migrated.jira.local'` and (`email_verification_token IS NULL` OR `email_verification_expiry < NOW()`)
2. For each: call `generateAndSendInvitation(user)` (existing method)
3. Return `{ sent: number, skipped: number }`

Skips users who already have a valid non-expired token (they were already invited recently).

---

#### 2d. `getJiraOrphans(orgId: string): Promise<JiraOrphan[]>`

New public method:
```sql
SELECT
  u.id,
  u.display_name AS "displayName",
  u.email,
  u.jira_account_id AS "jiraAccountId",
  u.invitation_status AS "invitationStatus",
  COUNT(pm.id)::int AS "projectCount"
FROM users u
LEFT JOIN organization_members om ON om.user_id = u.id AND om.organization_id = $1
LEFT JOIN project_members pm ON pm.user_id = u.id
LEFT JOIN projects p ON p.id = pm.project_id AND p.organization_id = $1
WHERE om.organization_id = $1
  AND u.email LIKE '%@migrated.jira.local'
GROUP BY u.id
ORDER BY "projectCount" DESC
```

Returns list of synthetic placeholder users still needing real emails.

---

### 3. `auth.service.ts`

#### 3a. `acceptInvitation()` — post-activation repair

After the existing `activateInvitedUser(user.id, dto.password, dto.displayName)` call succeeds, add:

```typescript
// Repair project/org memberships for this user's organisation
// Runs idempotently — safe to call every time
try {
  await this.organizationsService.repairOrgMemberships(user.organizationId);
} catch (err) {
  // Non-fatal — log but don't fail the acceptance
  this.logger.warn(`repairOrgMemberships failed for org ${user.organizationId}: ${err.message}`);
}
```

This ensures the moment a user accepts their invite, all `project_members` and `organization_members` rows derived from their Jira activity snap into place.

---

### 4. `jira-migration.processor.ts`

#### 4a. End-of-run repair step

At the end of `processJob()` (after Phase 6 or the last completed phase before a status update to `completed`), add a new `runRepairPhase(state)` function that executes the same three SQL blocks defined in Section 2b directly via the raw `pg` pool (the worker has no NestJS DI — it cannot call `organizationsService`). The SQL is identical; it is duplicated in the worker rather than shared via a service import.

```typescript
async function runRepairPhase(state: RunState, pool: Pool): Promise<void> {
  // Step 1: org_members for all project_members users
  // Step 2: project_members for assignees + reporters
  // Step 3: project_members for comment authors
  // (full SQL as in Section 2b, scoped to state.organizationId)
}
```

This ensures every completed migration run leaves a fully consistent state — no user can have `project_members` without `organization_members`, and every assignee/reporter/commenter is in the right projects.

---

### 5. New API Endpoints (`organizations.controller.ts`)

All three are admin-only (`@Roles('admin', 'owner')`).

#### `POST /organizations/:orgId/members/repair`

- Calls `repairOrgMemberships(orgId)`
- Response: `{ repairedOrgMembers: number, repairedProjectMembers: number }`
- **This is the immediate fix for all existing broken users** — admin calls it once after the migration

#### `POST /organizations/:orgId/members/bulk-invite`

- Calls `bulkInvitePending(orgId)`
- Response: `{ sent: number, skipped: number }`
- Fixes Scenario S3: migrated real-email members who were never sent an invite email

#### `GET /organizations/:orgId/members/jira-orphans`

- Calls `getJiraOrphans(orgId)`
- Response: array of `{ id, displayName, email, jiraAccountId, invitationStatus, projectCount }`
- Lets admin see exactly which Jira users still need a real email assigned

---

### 6. `InviteMemberDto`

Add one optional field:

```typescript
@IsOptional()
@IsBoolean()
forceCreate?: boolean;
```

---

## Edge Cases Handled

| Edge Case | Handling |
|-----------|----------|
| Admin calls `/repair` multiple times | All SQL uses `ON CONFLICT DO NOTHING` — fully idempotent |
| User has project_members in multiple orgs | `repairOrgMemberships` is org-scoped — only touches projects where `organization_id = $orgId` |
| Synthetic placeholder has issues assigned in multiple projects | Step 2 of repair covers all projects in the org via the issues join |
| `bulkInvitePending` called when invite token is still valid | Skipped (checked via `email_verification_expiry > NOW()`) — no duplicate emails |
| `inviteMember` called for a fresh org with no Jira placeholders | Placeholder check returns 0 rows → no change to existing behaviour |
| `acceptInvitation` repair fails (e.g. DB transient error) | Logged as warning, acceptance still succeeds — user can log in |
| org-admin inviting a user when placeholders exist but it's a genuinely new person | Pass `forceCreate: true` to bypass the 409 |
| Comment author not in project_members | Step 3 of repair adds them |

---

## Test Coverage

- `inviteMember()` returns 409 `JIRA_MERGE_REQUIRED` when org has synthetic placeholders and `forceCreate` not set
- `inviteMember()` succeeds when `forceCreate: true` regardless of placeholders
- `repairOrgMemberships()` inserts missing `organization_members` for users who have `project_members`
- `repairOrgMemberships()` inserts `project_members` for issue assignees and reporters
- `repairOrgMemberships()` inserts `project_members` for comment authors
- `repairOrgMemberships()` is idempotent (calling twice gives same result)
- `acceptInvitation()` calls `repairOrgMemberships` and user can query projects immediately after
- `bulkInvitePending()` sends emails only to users with expired/null tokens
- `bulkInvitePending()` skips users who already have a valid token
- `getJiraOrphans()` returns only synthetic placeholder users with correct project count
- Migration `down()` cleanly removes both indexes

---

## Files Changed

| File | Change |
|------|--------|
| `services/api/src/database/migrations/1744500000000-JiraMemberReconciliation.ts` | **Create** |
| `services/api/src/modules/organizations/organizations.service.ts` | **Modify** — add `repairOrgMemberships`, `bulkInvitePending`, `getJiraOrphans`; update `inviteMember` |
| `services/api/src/modules/organizations/organizations.controller.ts` | **Modify** — add 3 new endpoints |
| `services/api/src/modules/organizations/dto/invite-member.dto.ts` | **Modify** — add `forceCreate` field |
| `services/api/src/modules/auth/auth.service.ts` | **Modify** — repair call in `acceptInvitation` |
| `services/worker/src/migration/jira-migration.processor.ts` | **Modify** — add `runRepairPhase` with inline SQL; call at end of run |
| `services/api/src/modules/organizations/organizations.service.spec.ts` | **Modify** — new test cases |

## Out of Scope

- Frontend changes (the 409 response structure is designed for future frontend consumption)
- OAuth provider merging across users
- Migrating users across organisations
- Changing `getProjects` query logic (repair ensures `project_members` exist before user ever queries)
