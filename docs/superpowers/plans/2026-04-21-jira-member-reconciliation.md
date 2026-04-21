# Jira Member Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all broken scenarios where Jira-migrated members cannot see their projects, have missing memberships, or were never sent an invitation email — and prevent these from recurring.

**Architecture:** Four coordinated changes: (1) a DB migration adding two performance indexes; (2) three new methods + one updated method in `OrganizationsService`; (3) three new admin endpoints in `OrganizationsController`; (4) a `repairOrgMemberships` call added to `acceptInvitation` in `AuthService` and a `runRepairPhase` function added to the worker processor. All SQL is idempotent (`ON CONFLICT DO NOTHING`).

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL 15, BullMQ worker (`pg` raw pool), Jest

---

## File Map

| File | Change |
|------|--------|
| `services/api/src/database/migrations/1744500000000-JiraMemberReconciliation.ts` | Create — two additive indexes |
| `services/api/src/modules/organizations/dto/invite-member.dto.ts` | Modify — add `forceCreate?: boolean` |
| `services/api/src/modules/organizations/organizations.service.ts` | Modify — `inviteMember` guard + 3 new methods |
| `services/api/src/modules/organizations/organizations.controller.ts` | Modify — 3 new endpoints |
| `services/api/src/modules/auth/auth.service.ts` | Modify — repair call in `acceptInvitation` |
| `services/worker/src/migration/jira-migration.processor.ts` | Modify — `runRepairPhase` + call after Phase 6 |
| `services/api/src/modules/organizations/organizations.service.spec.ts` | Modify — new test cases |

---

## Task 1: DB Migration — Performance Indexes

**Files:**
- Create: `services/api/src/database/migrations/1744500000000-JiraMemberReconciliation.ts`

- [ ] **Step 1: Create the migration file**

```typescript
// services/api/src/database/migrations/1744500000000-JiraMemberReconciliation.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class JiraMemberReconciliation1744500000000 implements MigrationInterface {
  name = 'JiraMemberReconciliation1744500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fast lookup of Jira placeholder users by accountId during merge
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_jira_account_id"
        ON "users" ("jira_account_id")
        WHERE "jira_account_id" IS NOT NULL
    `);

    // Speeds up repair query: find all projects a user belongs to
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_project_members_user_id"
        ON "project_members" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_project_members_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_jira_account_id"`);
  }
}
```

- [ ] **Step 2: Verify the migration file is picked up**

```bash
cd /home/ubuntu/boardupscale/services/api
npm run build 2>&1 | tail -5
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add services/api/src/database/migrations/1744500000000-JiraMemberReconciliation.ts
git commit -m "feat: add jira member reconciliation indexes"
```

---

## Task 2: `InviteMemberDto` — Add `forceCreate` Field

**Files:**
- Modify: `services/api/src/modules/organizations/dto/invite-member.dto.ts`

- [ ] **Step 1: Add the field**

Replace the entire file content with:

```typescript
// services/api/src/modules/organizations/dto/invite-member.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ example: 'member', default: 'member', enum: ['owner', 'admin', 'member'] })
  @IsOptional()
  @IsString()
  @IsIn(['owner', 'admin', 'member'])
  role?: string = 'member';

  @ApiPropertyOptional({
    example: false,
    description:
      'Set to true to create a genuinely new user even when Jira placeholder users exist in the org. ' +
      'When false (default) and placeholders exist, the endpoint returns 409 JIRA_MERGE_REQUIRED.',
  })
  @IsOptional()
  @IsBoolean()
  forceCreate?: boolean;
}
```

- [ ] **Step 2: Build to verify no TS errors**

```bash
cd /home/ubuntu/boardupscale/services/api && npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add services/api/src/modules/organizations/dto/invite-member.dto.ts
git commit -m "feat: add forceCreate field to InviteMemberDto"
```

---

## Task 3: `OrganizationsService` — `repairOrgMemberships` Method

**Files:**
- Modify: `services/api/src/modules/organizations/organizations.service.ts`
- Test: `services/api/src/modules/organizations/organizations.service.spec.ts`

This is the core repair logic. Write the test first.

- [ ] **Step 1: Write the failing test**

Add this `describe` block at the end of the existing `describe('OrganizationsService', ...)` in `organizations.service.spec.ts`, before the closing `});`:

```typescript
describe('repairOrgMemberships', () => {
  it('should run all three repair SQL statements and return counts', async () => {
    // dataSource.query is called three times (step 1 org_members, step 2a assignees, step 2b reporters, step 3 comments = 4 calls)
    // but rowsAffected returns {rowCount} for each
    mockDataSource.query = jest.fn()
      .mockResolvedValueOnce({ rowCount: 2 }) // org_members repair
      .mockResolvedValueOnce({ rowCount: 3 }) // assignee project_members
      .mockResolvedValueOnce({ rowCount: 1 }) // reporter project_members
      .mockResolvedValueOnce({ rowCount: 0 }); // comment author project_members

    const result = await service.repairOrgMemberships(TEST_IDS.ORG_ID);

    expect(mockDataSource.query).toHaveBeenCalledTimes(4);
    expect(result).toEqual({ repairedOrgMembers: 2, repairedProjectMembers: 4 });
  });

  it('should return zeros when nothing needs repair', async () => {
    mockDataSource.query = jest.fn().mockResolvedValue({ rowCount: 0 });

    const result = await service.repairOrgMemberships(TEST_IDS.ORG_ID);

    expect(result).toEqual({ repairedOrgMembers: 0, repairedProjectMembers: 0 });
  });
});
```

Note: the test setup uses `mockDataSource` which is defined at the top of the describe block as:
```typescript
const mockDataSource = { transaction: jest.fn((cb: any) => cb({ query: jest.fn().mockResolvedValue({ rows: [] }) })) };
```
You need to add `query: jest.fn()` to that object so direct `dataSource.query(...)` calls work. Update the `mockDataSource` definition in `beforeEach` setup area:

```typescript
// Change this line (around line 24):
const mockDataSource = { transaction: jest.fn((cb: any) => cb({ query: jest.fn().mockResolvedValue({ rows: [] }) })) };
// To:
const mockDataSource = {
  transaction: jest.fn((cb: any) => cb({ query: jest.fn().mockResolvedValue({ rows: [] }) })),
  query: jest.fn(),
};
```

- [ ] **Step 2: Run the test to see it fail**

```bash
cd /home/ubuntu/boardupscale/services/api && npm test -- --testPathPattern=organizations.service.spec --passWithNoTests 2>&1 | tail -20
```

Expected: FAIL — `service.repairOrgMemberships is not a function`.

- [ ] **Step 3: Implement `repairOrgMemberships` in `organizations.service.ts`**

Add this method just before the `// ── SAML SSO Configuration ─────` comment (around line 662):

```typescript
async repairOrgMemberships(
  organizationId: string,
): Promise<{ repairedOrgMembers: number; repairedProjectMembers: number }> {
  // Step 1: Ensure every user who has project_members in this org also has organization_members
  const orgMembersResult = await this.dataSource.query(
    `INSERT INTO organization_members (id, user_id, organization_id, role, is_default, created_at, updated_at)
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
     ON CONFLICT (user_id, organization_id) DO NOTHING`,
    [organizationId],
  );

  // Step 2a: Re-sync assignees → project_members
  const assigneeResult = await this.dataSource.query(
    `INSERT INTO project_members (id, project_id, user_id, role, created_at, updated_at)
     SELECT gen_random_uuid(), i.project_id, i.assignee_id, 'member', NOW(), NOW()
     FROM issues i
     JOIN projects p ON p.id = i.project_id AND p.organization_id = $1
     WHERE i.assignee_id IS NOT NULL
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [organizationId],
  );

  // Step 2b: Re-sync reporters → project_members
  const reporterResult = await this.dataSource.query(
    `INSERT INTO project_members (id, project_id, user_id, role, created_at, updated_at)
     SELECT gen_random_uuid(), i.project_id, i.reporter_id, 'member', NOW(), NOW()
     FROM issues i
     JOIN projects p ON p.id = i.project_id AND p.organization_id = $1
     WHERE i.reporter_id IS NOT NULL
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [organizationId],
  );

  // Step 3: Re-sync comment authors → project_members
  const commentResult = await this.dataSource.query(
    `INSERT INTO project_members (id, project_id, user_id, role, created_at, updated_at)
     SELECT gen_random_uuid(), i.project_id, c.author_id, 'member', NOW(), NOW()
     FROM comments c
     JOIN issues i ON i.id = c.issue_id
     JOIN projects p ON p.id = i.project_id AND p.organization_id = $1
     WHERE c.author_id IS NOT NULL
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [organizationId],
  );

  const repairedOrgMembers = orgMembersResult?.rowCount ?? 0;
  const repairedProjectMembers =
    (assigneeResult?.rowCount ?? 0) +
    (reporterResult?.rowCount ?? 0) +
    (commentResult?.rowCount ?? 0);

  return { repairedOrgMembers, repairedProjectMembers };
}
```

- [ ] **Step 4: Run the test to see it pass**

```bash
cd /home/ubuntu/boardupscale/services/api && npm test -- --testPathPattern=organizations.service.spec --passWithNoTests 2>&1 | tail -20
```

Expected: PASS — all tests green including the two new `repairOrgMemberships` tests.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/modules/organizations/organizations.service.ts \
        services/api/src/modules/organizations/organizations.service.spec.ts
git commit -m "feat: add repairOrgMemberships to OrganizationsService"
```

---

## Task 4: `OrganizationsService` — `bulkInvitePending` Method

**Files:**
- Modify: `services/api/src/modules/organizations/organizations.service.ts`
- Test: `services/api/src/modules/organizations/organizations.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add this `describe` block to `organizations.service.spec.ts`:

```typescript
describe('bulkInvitePending', () => {
  it('should send invitations to users with pending status and no valid token', async () => {
    const pendingUser1 = mockUser({
      id: 'pending-1',
      email: 'p1@example.com',
      invitationStatus: 'pending',
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    });
    const pendingUser2 = mockUser({
      id: 'pending-2',
      email: 'p2@example.com',
      invitationStatus: 'pending',
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    });

    userRepo.find.mockResolvedValue([pendingUser1, pendingUser2]);
    userRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
    userRepo.findOne
      .mockResolvedValueOnce(mockUser({ id: 'inviter-id' })) // inviter for user1
      .mockResolvedValueOnce(mockUser({ id: 'inviter-id' })); // inviter for user2
    orgRepo.findOne.mockResolvedValue(mockOrganization());

    const result = await service.bulkInvitePending(TEST_IDS.ORG_ID);

    expect(result).toEqual({ sent: 2, skipped: 0 });
    expect(mockEmailService.sendInvitationEmail).toHaveBeenCalledTimes(2);
  });

  it('should skip users who already have a valid non-expired token', async () => {
    const futureExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h from now
    const alreadyInvited = mockUser({
      id: 'already-invited',
      email: 'invited@example.com',
      invitationStatus: 'pending',
      emailVerificationToken: 'existing-hash',
      emailVerificationExpiry: futureExpiry,
    });

    userRepo.find.mockResolvedValue([alreadyInvited]);

    const result = await service.bulkInvitePending(TEST_IDS.ORG_ID);

    expect(result).toEqual({ sent: 0, skipped: 1 });
    expect(mockEmailService.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('should return zeros when no pending users exist', async () => {
    userRepo.find.mockResolvedValue([]);

    const result = await service.bulkInvitePending(TEST_IDS.ORG_ID);

    expect(result).toEqual({ sent: 0, skipped: 0 });
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

```bash
cd /home/ubuntu/boardupscale/services/api && npm test -- --testPathPattern=organizations.service.spec --passWithNoTests 2>&1 | tail -20
```

Expected: FAIL — `service.bulkInvitePending is not a function`.

- [ ] **Step 3: Implement `bulkInvitePending` in `organizations.service.ts`**

Add this method immediately after `repairOrgMemberships`:

```typescript
async bulkInvitePending(
  organizationId: string,
): Promise<{ sent: number; skipped: number }> {
  // Find all pending-status members in this org who have a real (non-synthetic) email
  const pendingUsers = await this.userRepository.find({
    where: {
      organizationId,
      invitationStatus: 'pending',
    } as any,
  });

  // Filter to users whose token is missing or expired
  const now = new Date();
  const toInvite = pendingUsers.filter(
    (u) =>
      !u.email.endsWith('@migrated.jira.local') &&
      (!u.emailVerificationToken ||
        !u.emailVerificationExpiry ||
        new Date(u.emailVerificationExpiry) < now),
  );
  const skipped = pendingUsers.length - toInvite.length;

  for (const user of toInvite) {
    await this.generateAndSendInvitation(user, organizationId, organizationId);
  }

  return { sent: toInvite.length, skipped };
}
```

Note: `generateAndSendInvitation` takes `(user, inviterId, organizationId)`. We pass `organizationId` as `inviterId` here as a system-level action — no human inviter. The email still sends correctly; the inviter display name resolves to `null` and falls back to `'A team member'`.

- [ ] **Step 4: Run the test to see it pass**

```bash
cd /home/ubuntu/boardupscale/services/api && npm test -- --testPathPattern=organizations.service.spec --passWithNoTests 2>&1 | tail -20
```

Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/modules/organizations/organizations.service.ts \
        services/api/src/modules/organizations/organizations.service.spec.ts
git commit -m "feat: add bulkInvitePending to OrganizationsService"
```

---

## Task 5: `OrganizationsService` — `getJiraOrphans` Method

**Files:**
- Modify: `services/api/src/modules/organizations/organizations.service.ts`
- Test: `services/api/src/modules/organizations/organizations.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add this `describe` block to `organizations.service.spec.ts`:

```typescript
describe('getJiraOrphans', () => {
  it('should return synthetic placeholder users with project count', async () => {
    const orphanRows = [
      {
        id: 'orphan-1',
        displayName: 'Shujaat Ali',
        email: 'jira-abc123@migrated.jira.local',
        jiraAccountId: 'abc123',
        invitationStatus: 'none',
        projectCount: 3,
      },
    ];
    mockDataSource.query = jest.fn().mockResolvedValue(orphanRows);

    const result = await service.getJiraOrphans(TEST_IDS.ORG_ID);

    expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    expect(result).toEqual(orphanRows);
    expect(result[0].projectCount).toBe(3);
  });

  it('should return empty array when no orphans exist', async () => {
    mockDataSource.query = jest.fn().mockResolvedValue([]);

    const result = await service.getJiraOrphans(TEST_IDS.ORG_ID);

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

```bash
cd /home/ubuntu/boardupscale/services/api && npm test -- --testPathPattern=organizations.service.spec --passWithNoTests 2>&1 | tail -20
```

Expected: FAIL — `service.getJiraOrphans is not a function`.

- [ ] **Step 3: Implement `getJiraOrphans` in `organizations.service.ts`**

Add this method immediately after `bulkInvitePending`:

```typescript
async getJiraOrphans(
  organizationId: string,
): Promise<Array<{
  id: string;
  displayName: string;
  email: string;
  jiraAccountId: string | null;
  invitationStatus: string;
  projectCount: number;
}>> {
  const rows = await this.dataSource.query(
    `SELECT
       u.id,
       u.display_name AS "displayName",
       u.email,
       u.jira_account_id AS "jiraAccountId",
       u.invitation_status AS "invitationStatus",
       COUNT(DISTINCT pm.id)::int AS "projectCount"
     FROM users u
     JOIN organization_members om ON om.user_id = u.id AND om.organization_id = $1
     LEFT JOIN project_members pm ON pm.user_id = u.id
     LEFT JOIN projects p ON p.id = pm.project_id AND p.organization_id = $1
     WHERE u.email LIKE '%@migrated.jira.local'
     GROUP BY u.id
     ORDER BY "projectCount" DESC`,
    [organizationId],
  );
  return rows;
}
```

- [ ] **Step 4: Run to see it pass**

```bash
cd /home/ubuntu/boardupscale/services/api && npm test -- --testPathPattern=organizations.service.spec --passWithNoTests 2>&1 | tail -20
```

Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/modules/organizations/organizations.service.ts \
        services/api/src/modules/organizations/organizations.service.spec.ts
git commit -m "feat: add getJiraOrphans to OrganizationsService"
```

---

## Task 6: `OrganizationsService` — Guard `inviteMember` Against Merge-Skipping

**Files:**
- Modify: `services/api/src/modules/organizations/organizations.service.ts`
- Test: `services/api/src/modules/organizations/organizations.service.spec.ts`

- [ ] **Step 1: Add `HttpException` to imports in `organizations.service.ts`**

The file currently imports from `@nestjs/common`:
```typescript
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
```

Add `HttpException` and `HttpStatus`:
```typescript
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
```

- [ ] **Step 2: Write the failing test**

Add this test inside the existing `describe('inviteMember', ...)` block in `organizations.service.spec.ts`, after the last existing `it(...)` in that block:

```typescript
it('should return 409 JIRA_MERGE_REQUIRED when org has Jira placeholders and forceCreate is not set', async () => {
  const placeholder = mockUser({
    id: 'placeholder-id',
    email: 'jira-abc@migrated.jira.local',
    displayName: 'Shujaat Ali',
  });

  // No user exists with the invited email
  userRepo.findOne.mockResolvedValueOnce(null);
  // Synthetic placeholders exist in the org
  userRepo.find.mockResolvedValueOnce([placeholder]);

  await expect(
    service.inviteMember(TEST_IDS.ORG_ID, { email: 'shujaat@example.com', role: 'member' }, inviterId),
  ).rejects.toMatchObject({
    status: 409,
    response: expect.objectContaining({ code: 'JIRA_MERGE_REQUIRED' }),
  });
});

it('should create a new user when forceCreate is true even with Jira placeholders', async () => {
  const placeholder = mockUser({
    id: 'placeholder-id',
    email: 'jira-abc@migrated.jira.local',
    displayName: 'Shujaat Ali',
  });

  userRepo.findOne
    .mockResolvedValueOnce(null)   // email check — no existing user
    .mockResolvedValueOnce(mockUser({ id: inviterId })); // inviter lookup in generateAndSendInvitation
  userRepo.find.mockResolvedValueOnce([placeholder]); // synthetic placeholders
  orgRepo.findOne.mockResolvedValue(mockOrganization());
  userRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
  const newUser = mockUser({ email: 'shujaat@example.com', isActive: false });
  userRepo.create.mockReturnValue(newUser);
  userRepo.save.mockResolvedValue(newUser);
  mockOrgMemberQb();

  const result = await service.inviteMember(
    TEST_IDS.ORG_ID,
    { email: 'shujaat@example.com', role: 'member', forceCreate: true },
    inviterId,
  );

  expect(result).toEqual(newUser);
  expect(userRepo.create).toHaveBeenCalled();
});

it('should proceed normally when no Jira placeholders exist', async () => {
  userRepo.findOne
    .mockResolvedValueOnce(null)  // email check
    .mockResolvedValueOnce(mockUser({ id: inviterId })); // inviter
  userRepo.find.mockResolvedValueOnce([]); // no synthetic placeholders
  orgRepo.findOne.mockResolvedValue(mockOrganization());
  userRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
  const newUser = mockUser({ email: 'fresh@example.com', isActive: false });
  userRepo.create.mockReturnValue(newUser);
  userRepo.save.mockResolvedValue(newUser);
  mockOrgMemberQb();

  const result = await service.inviteMember(
    TEST_IDS.ORG_ID,
    { email: 'fresh@example.com', role: 'member' },
    inviterId,
  );

  expect(result).toEqual(newUser);
});
```

- [ ] **Step 3: Run to see them fail**

```bash
cd /home/ubuntu/boardupscale/services/api && npm test -- --testPathPattern=organizations.service.spec --passWithNoTests 2>&1 | tail -20
```

Expected: 3 new failures.

- [ ] **Step 4: Update `inviteMember` in `organizations.service.ts`**

Find the section that creates a new user (after `if (existingUser) { ... }`), which begins with:
```typescript
// Create user without password (invitation pending)
const user = this.userRepository.create({
```

Insert the following block IMMEDIATELY BEFORE that comment (between line 132 `return existingUser;` closing brace and line 134 `// Create user without password`):

```typescript
    // Guard: if org has Jira placeholder users (synthetic emails), the admin must either
    // select a placeholder to merge with OR explicitly pass forceCreate:true.
    // This prevents silently creating a fresh user that is disconnected from Jira history.
    if (!dto.forceCreate) {
      const placeholders = await this.userRepository.find({
        where: { organizationId } as any,
      });
      const syntheticPlaceholders = placeholders.filter((u) =>
        u.email.endsWith('@migrated.jira.local'),
      );
      if (syntheticPlaceholders.length > 0) {
        throw new HttpException(
          {
            statusCode: HttpStatus.CONFLICT,
            code: 'JIRA_MERGE_REQUIRED',
            message:
              'This organisation has Jira placeholder users. Select a placeholder to merge with, ' +
              'or pass forceCreate:true to add a genuinely new member.',
            placeholders: syntheticPlaceholders.map((u) => ({
              id: u.id,
              displayName: u.displayName,
              email: u.email,
            })),
          },
          HttpStatus.CONFLICT,
        );
      }
    }
```

- [ ] **Step 5: Run to see all tests pass**

```bash
cd /home/ubuntu/boardupscale/services/api && npm test -- --testPathPattern=organizations.service.spec --passWithNoTests 2>&1 | tail -20
```

Expected: all tests green including all 3 new ones.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/modules/organizations/organizations.service.ts \
        services/api/src/modules/organizations/organizations.service.spec.ts
git commit -m "feat: guard inviteMember against merge-skipping when Jira placeholders exist"
```

---

## Task 7: New Controller Endpoints — Repair, Bulk-Invite, Jira Orphans

**Files:**
- Modify: `services/api/src/modules/organizations/organizations.controller.ts`

No new test file needed — controller tests use integration/e2e tests. The service methods are already unit-tested.

- [ ] **Step 1: Add the three new endpoints**

In `organizations.controller.ts`, add the following three methods at the end of the class, just before the closing `}`. Insert after the `deleteSamlConfig` method (after line 214):

```typescript
  // ── Jira Member Reconciliation ──────────────────────────────────────────

  @Post('me/members/repair')
  @ApiOperation({
    summary: 'Repair Jira member memberships — fixes users with missing org_members or project_members',
    description:
      'Idempotent. Re-syncs organization_members and project_members from issue assignees, reporters, ' +
      'and comment authors. Call once after a Jira migration to heal any broken states.',
  })
  @Roles('admin', 'owner')
  async repairOrgMemberships(@OrgId() organizationId: string) {
    const result = await this.organizationsService.repairOrgMemberships(organizationId);
    return { data: result };
  }

  @Post('me/members/bulk-invite')
  @ApiOperation({
    summary: 'Send invitation emails to all pending migrated members who have not yet been invited',
    description:
      'Finds all users in the org with invitation_status=pending and no valid token, then sends invite emails.',
  })
  @Roles('admin', 'owner')
  async bulkInvitePending(@OrgId() organizationId: string) {
    const result = await this.organizationsService.bulkInvitePending(organizationId);
    return { data: result };
  }

  @Get('me/members/jira-orphans')
  @ApiOperation({
    summary: 'List Jira placeholder users still using synthetic @migrated.jira.local emails',
    description: 'Returns synthetic placeholder users who need a real email assigned via the update-email endpoint.',
  })
  @Roles('admin', 'owner')
  async getJiraOrphans(@OrgId() organizationId: string) {
    const result = await this.organizationsService.getJiraOrphans(organizationId);
    return { data: result };
  }
```

- [ ] **Step 2: Build to verify no TS errors**

```bash
cd /home/ubuntu/boardupscale/services/api && npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add services/api/src/modules/organizations/organizations.controller.ts
git commit -m "feat: add repair, bulk-invite, and jira-orphans endpoints"
```

---

## Task 8: `AuthService` — Auto-Repair on Invitation Acceptance

**Files:**
- Modify: `services/api/src/modules/auth/auth.service.ts`

- [ ] **Step 1: Verify `OrganizationsService` is injectable in `AuthService`**

```bash
grep -n "OrganizationsService\|organizationsService" /home/ubuntu/boardupscale/services/api/src/modules/auth/auth.service.ts | head -10
grep -n "OrganizationsService\|OrganizationsModule" /home/ubuntu/boardupscale/services/api/src/modules/auth/auth.module.ts | head -10
```

If `OrganizationsService` is NOT already injected in `AuthService`, skip to Step 1b. If it IS injected, skip Step 1b and go directly to Step 2.

- [ ] **Step 1b (if not yet injected): Add `OrganizationsService` to `AuthService`**

In `auth.service.ts`, add to the import line at top:
```typescript
import { OrganizationsService } from '../organizations/organizations.service';
```

In `auth.service.ts` constructor, add a new parameter:
```typescript
private organizationsService: OrganizationsService,
```

In `auth.module.ts`, ensure `OrganizationsModule` is in `imports` and `OrganizationsService` is available. Check:
```bash
grep -n "imports\|OrganizationsModule" /home/ubuntu/boardupscale/services/api/src/modules/auth/auth.module.ts
```

If `OrganizationsModule` is not in imports, add it:
```typescript
import { OrganizationsModule } from '../organizations/organizations.module';
// In @Module imports array:
OrganizationsModule,
```

- [ ] **Step 2: Add repair call in `acceptInvitation`**

In `auth.service.ts`, find the `acceptInvitation` method. After the existing `organization_members` block (around lines 817–830 — after the `if (!existingMembership) { ... }` block that creates the org_members row), add:

```typescript
    // Auto-repair project/org memberships for this user's organisation.
    // Idempotent — ensures Jira-migrated users see all their projects immediately after accepting.
    try {
      await this.organizationsService.repairOrgMemberships(user.organizationId);
    } catch (repairErr: any) {
      // Non-fatal — log the warning but do not fail the invitation acceptance
      console.warn(
        `[acceptInvitation] repairOrgMemberships failed for org ${user.organizationId}: ${repairErr?.message}`,
      );
    }
```

The full `acceptInvitation` method after this change ends with:
```typescript
    // ... existing org_members ensure block ...

    // Auto-repair project/org memberships for this user's organisation.
    try {
      await this.organizationsService.repairOrgMemberships(user.organizationId);
    } catch (repairErr: any) {
      console.warn(`[acceptInvitation] repairOrgMemberships failed for org ${user.organizationId}: ${repairErr?.message}`);
    }

    const activatedUser = await this.usersService.findById(user.id);
    const tokens = await this.generateTokens(activatedUser, ipAddress, userAgent);
    // ... rest unchanged
```

- [ ] **Step 3: Build to verify no TS errors**

```bash
cd /home/ubuntu/boardupscale/services/api && npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 4: Run full API test suite**

```bash
cd /home/ubuntu/boardupscale/services/api && npm test -- --passWithNoTests 2>&1 | tail -15
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/modules/auth/auth.service.ts \
        services/api/src/modules/auth/auth.module.ts
git commit -m "feat: auto-repair org/project memberships when user accepts invitation"
```

---

## Task 9: Worker — `runRepairPhase` at End of Migration

**Files:**
- Modify: `services/worker/src/migration/jira-migration.processor.ts`

The worker uses a raw `pg` pool — no NestJS DI. The repair SQL is inlined directly.

- [ ] **Step 1: Add the `runRepairPhase` function**

In `jira-migration.processor.ts`, add this function near the other phase functions (e.g., after `runAttachmentsPhase`). Find the end of `runAttachmentsPhase` and add after its closing `}`:

```typescript
/**
 * Phase 7 — Membership Repair
 *
 * Idempotent cleanup: ensures every user who has project_members in this org
 * also has an organization_members row, and re-syncs project_members from
 * issue assignees, reporters, and comment authors.
 *
 * Runs at the end of every migration run.
 */
async function runRepairPhase(client: PoolClient, state: RunState): Promise<void> {
  const orgId = state.organizationId;

  console.log(`[Migration:${state.id}] Phase 7 — Repairing org/project memberships`);

  // Step 1: org_members for all project_members users
  await client.query(
    `INSERT INTO organization_members (id, user_id, organization_id, role, is_default, created_at, updated_at)
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
     ON CONFLICT (user_id, organization_id) DO NOTHING`,
    [orgId],
  );

  // Step 2a: project_members for issue assignees
  await client.query(
    `INSERT INTO project_members (id, project_id, user_id, role, created_at, updated_at)
     SELECT gen_random_uuid(), i.project_id, i.assignee_id, 'member', NOW(), NOW()
     FROM issues i
     JOIN projects p ON p.id = i.project_id AND p.organization_id = $1
     WHERE i.assignee_id IS NOT NULL
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [orgId],
  );

  // Step 2b: project_members for issue reporters
  await client.query(
    `INSERT INTO project_members (id, project_id, user_id, role, created_at, updated_at)
     SELECT gen_random_uuid(), i.project_id, i.reporter_id, 'member', NOW(), NOW()
     FROM issues i
     JOIN projects p ON p.id = i.project_id AND p.organization_id = $1
     WHERE i.reporter_id IS NOT NULL
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [orgId],
  );

  // Step 3: project_members for comment authors
  await client.query(
    `INSERT INTO project_members (id, project_id, user_id, role, created_at, updated_at)
     SELECT gen_random_uuid(), i.project_id, c.author_id, 'member', NOW(), NOW()
     FROM comments c
     JOIN issues i ON i.id = c.issue_id
     JOIN projects p ON p.id = i.project_id AND p.organization_id = $1
     WHERE c.author_id IS NOT NULL
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [orgId],
  );

  console.log(`[Migration:${state.id}] Phase 7 — Membership repair complete`);
}
```

- [ ] **Step 2: Call `runRepairPhase` after Phase 6**

In the main job execution block, find this comment and code:

```typescript
      // ── Write final result summary (read fresh counts from DB) ──────────────
      const { rows: finalCounts } = await progressClient.query<{
```

Insert the following IMMEDIATELY BEFORE that comment:

```typescript
      // ── Phase 7 — membership repair ─────────────────────────────────────────
      try {
        await runRepairPhase(progressClient, state);
      } catch (repairErr: any) {
        // Non-fatal — log but do not fail the migration
        console.warn(`[Migration:${state.id}] Phase 7 repair failed (non-fatal): ${repairErr?.message}`);
      }

```

- [ ] **Step 3: Build the worker to verify no TS errors**

```bash
cd /home/ubuntu/boardupscale/services/worker && npm run build 2>&1 | tail -10
```

Expected: `Found 0 errors.`

- [ ] **Step 4: Run worker tests**

```bash
cd /home/ubuntu/boardupscale/services/worker && npm test 2>&1 | tail -10
```

Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/worker/src/migration/jira-migration.processor.ts
git commit -m "feat: add Phase 7 membership repair at end of migration run"
```

---

## Task 10: Full Build + Test Verification

- [ ] **Step 1: Run full API test suite**

```bash
cd /home/ubuntu/boardupscale/services/api && npm test -- --passWithNoTests 2>&1 | tail -20
```

Expected: all tests pass, no failures.

- [ ] **Step 2: Run full worker test suite**

```bash
cd /home/ubuntu/boardupscale/services/worker && npm test 2>&1 | tail -10
```

Expected: all 11 tests pass.

- [ ] **Step 3: Build both services**

```bash
cd /home/ubuntu/boardupscale/services/api && npm run build 2>&1 | tail -5
cd /home/ubuntu/boardupscale/services/worker && npm run build 2>&1 | tail -5
```

Expected: both build with zero errors.

- [ ] **Step 4: Final commit if any remaining changes**

```bash
git status
# Only commit if there are uncommitted changes
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ DB migration (indexes) → Task 1
- ✅ `InviteMemberDto.forceCreate` → Task 2
- ✅ `repairOrgMemberships` (3 SQL steps) → Task 3
- ✅ `bulkInvitePending` → Task 4
- ✅ `getJiraOrphans` → Task 5
- ✅ `inviteMember` guard (409 JIRA_MERGE_REQUIRED) → Task 6
- ✅ `POST /members/repair` endpoint → Task 7
- ✅ `POST /members/bulk-invite` endpoint → Task 7
- ✅ `GET /members/jira-orphans` endpoint → Task 7
- ✅ `acceptInvitation` auto-repair → Task 8
- ✅ Worker `runRepairPhase` → Task 9
- ✅ All methods have unit tests → Tasks 3–6
- ✅ Build + test verification → Task 10

**All scenarios fixed:**
- S1 (synthetic + no merge): `inviteMember` 409 guard prevents this going forward; `/repair` endpoint fixes existing broken state
- S2 (real email migrated, blank board): `acceptInvitation` calls `repairOrgMemberships` after activation
- S3 (no invite email sent): `bulkInvitePending` sends to all pending members
- S4 (active user, no project_members): `/repair` endpoint + end-of-migration repair phase
