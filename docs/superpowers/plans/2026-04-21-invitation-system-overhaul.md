# Invitation System Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix "Invalid Invitation" errors for Jira-migrated users by adding an `invitation_status` state machine, making merge atomic, adding re-invite UI, project auto-assignment at import time, and distinct error screens.

**Architecture:** Add `invitation_status VARCHAR(20)` to `users` to decouple invitation state from `isActive`. All invite validation and state transitions use this field. Merge is wrapped in a DB transaction. Jira migration gains Phase 1b to auto-assign users to projects based on issue activity.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL 15, React 18, TanStack Query v5, Tailwind CSS

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `services/api/src/database/migrations/1744300000000-AddInvitationStatus.ts` | Create | Add column, backfill, index |
| `services/api/src/modules/users/entities/user.entity.ts` | Modify | Add `invitationStatus` field |
| `services/api/src/modules/users/users.service.ts` | Modify | Update `activateInvitedUser` to set `invitationStatus = 'accepted'` |
| `services/api/src/modules/auth/auth.service.ts` | Modify | Update `validateInvitation`, `acceptInvitation` |
| `services/api/src/modules/organizations/organizations.service.ts` | Modify | Update `inviteMember`, `resendInvitation`, `revokeInvitation`, `updateMigratedMemberEmail`, `mergeAndInviteExistingUser`, add `getMergePreview` |
| `services/api/src/modules/organizations/organizations.controller.ts` | Modify | Add `GET /members/:id/merge-preview` endpoint, update `PATCH /email` to accept `confirmMerge` |
| `services/api/src/modules/organizations/dto/update-member-email.dto.ts` | Modify | Add `confirmMerge?: boolean` field |
| `services/worker/src/migration/jira-migration.processor.ts` | Modify | Fix user creation flags, add Phase 1b project member sync |
| `services/web/src/types/index.ts` | Modify | Add `invitationStatus` to `User` interface |
| `services/web/src/hooks/useOrganization.ts` | Modify | Update `useUpdateMemberEmail` to handle 409, add `useMergePreview`, `useConfirmMerge` |
| `services/web/src/pages/auth/AcceptInvitePage.tsx` | Modify | Distinct error states per error code |
| `services/web/src/pages/TeamPage.tsx` | Modify | Replace `isActive`-based status with `invitationStatus`, show expired badge |
| `services/web/src/components/MergeConfirmationModal.tsx` | Create | Merge preview + confirm modal |

---

## Task 1: DB Migration — Add `invitation_status`

**Files:**
- Create: `services/api/src/database/migrations/1744300000000-AddInvitationStatus.ts`

- [ ] **Step 1: Create migration file**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvitationStatus1744300000000 implements MigrationInterface {
  name = 'AddInvitationStatus1744300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add column with default 'none'
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "invitation_status" VARCHAR(20) NOT NULL DEFAULT 'none'
    `);

    // Backfill: active users → 'accepted'
    await queryRunner.query(`
      UPDATE "users" SET "invitation_status" = 'accepted' WHERE "is_active" = true
    `);

    // Backfill: inactive users (pending invites) → 'pending'
    await queryRunner.query(`
      UPDATE "users" SET "invitation_status" = 'pending' WHERE "is_active" = false
    `);

    // Backfill: Jira-migrated users with synthetic email → 'none'
    // These are active but have no real email and no invite sent yet
    await queryRunner.query(`
      UPDATE "users"
      SET "invitation_status" = 'none'
      WHERE "email" LIKE '%@migrated.jira.local'
    `);

    // Index for member list filtering by org + status
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_org_invitation_status"
      ON "users" ("organization_id", "invitation_status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_org_invitation_status"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "invitation_status"`);
  }
}
```

- [ ] **Step 2: Run migration**

```bash
cd /home/ubuntu/boardupscale/services/api
npm run migration:run
```

Expected: Migration `AddInvitationStatus1744300000000` runs successfully with no errors.

- [ ] **Step 3: Verify column exists**

```bash
cd /home/ubuntu/boardupscale/services/api
npm run migration:run -- --check
```

Expected: No pending migrations.

- [ ] **Step 4: Commit**

```bash
git add services/api/src/database/migrations/1744300000000-AddInvitationStatus.ts
git commit -m "feat: add invitation_status migration with backfill"
```

---

## Task 2: User Entity — Add `invitationStatus` Field

**Files:**
- Modify: `services/api/src/modules/users/entities/user.entity.ts`

- [ ] **Step 1: Add field after `emailVerified`**

In `services/api/src/modules/users/entities/user.entity.ts`, add after line 47 (`emailVerified` column):

```typescript
  @Column({ name: 'invitation_status', type: 'varchar', length: 20, default: 'none' })
  invitationStatus: string;
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd /home/ubuntu/boardupscale/services/api
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors related to `invitationStatus`.

- [ ] **Step 3: Commit**

```bash
git add services/api/src/modules/users/entities/user.entity.ts
git commit -m "feat: add invitationStatus field to User entity"
```

---

## Task 3: Users Service — Update `activateInvitedUser`

**Files:**
- Modify: `services/api/src/modules/users/users.service.ts` (lines 271–284)

- [ ] **Step 1: Update `activateInvitedUser` to set `invitationStatus = 'accepted'`**

Replace the existing `activateInvitedUser` method body:

```typescript
  async activateInvitedUser(
    id: string,
    passwordHash: string,
    displayName: string,
  ): Promise<void> {
    await this.usersRepository.update(id, {
      passwordHash,
      displayName,
      isActive: true,
      invitationStatus: 'accepted',
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    });
  }
```

- [ ] **Step 2: Build check**

```bash
cd /home/ubuntu/boardupscale/services/api
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add services/api/src/modules/users/users.service.ts
git commit -m "feat: set invitationStatus=accepted on invite acceptance"
```

---

## Task 4: Auth Service — Fix `validateInvitation` and `acceptInvitation`

**Files:**
- Modify: `services/api/src/modules/auth/auth.service.ts` (lines ~723–811)

- [ ] **Step 1: Replace `validateInvitation`**

Find and replace the entire `validateInvitation` method (starts at `async validateInvitation`):

```typescript
  async validateInvitation(rawToken: string): Promise<{ email: string; organizationName: string }> {
    const tokenHash = this.hashToken(rawToken);
    const user = await this.usersService.findByEmailVerificationToken(tokenHash);

    if (!user) {
      throw new BadRequestException({
        message: 'This invite link is invalid or has already been used.',
        code: 'INVITE_INVALID',
      });
    }

    if (user.invitationStatus === 'accepted') {
      throw new BadRequestException({
        message: 'Your account is already active.',
        code: 'INVITE_ALREADY_ACCEPTED',
      });
    }

    if (user.invitationStatus === 'none') {
      throw new BadRequestException({
        message: "Your admin hasn't sent an invitation yet. Contact them to get access.",
        code: 'INVITE_NOT_SENT',
      });
    }

    // Check expiry — set status to expired if TTL has passed
    if (
      user.emailVerificationExpiry &&
      new Date(user.emailVerificationExpiry) < new Date()
    ) {
      await this.usersService.update(user.id, { invitationStatus: 'expired' } as any);
      throw new BadRequestException({
        message: 'This invite expired after 7 days. Ask your admin to resend it.',
        code: 'INVITE_EXPIRED',
      });
    }

    const org = await this.organizationRepository.findOne({
      where: { id: user.organizationId },
    });

    return {
      email: user.email,
      organizationName: org?.name || '',
    };
  }
```

- [ ] **Step 2: Replace `acceptInvitation`**

Find and replace the entire `acceptInvitation` method:

```typescript
  async acceptInvitation(
    rawToken: string,
    password: string,
    displayName: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    this.passwordPolicyService.validate(password);

    const tokenHash = this.hashToken(rawToken);
    const user = await this.usersService.findByEmailVerificationToken(tokenHash);

    if (!user) {
      throw new BadRequestException({
        message: 'This invite link is invalid or has already been used.',
        code: 'INVITE_INVALID',
      });
    }

    if (user.invitationStatus === 'accepted') {
      throw new BadRequestException({
        message: 'Your account is already active.',
        code: 'INVITE_ALREADY_ACCEPTED',
      });
    }

    if (user.invitationStatus === 'none') {
      throw new BadRequestException({
        message: "Your admin hasn't sent an invitation yet. Contact them to get access.",
        code: 'INVITE_NOT_SENT',
      });
    }

    if (
      user.emailVerificationExpiry &&
      new Date(user.emailVerificationExpiry) < new Date()
    ) {
      await this.usersService.update(user.id, { invitationStatus: 'expired' } as any);
      throw new BadRequestException({
        message: 'This invite expired after 7 days. Ask your admin to resend it.',
        code: 'INVITE_EXPIRED',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await this.usersService.activateInvitedUser(user.id, passwordHash, displayName);

    // Ensure organization_members row exists
    const existingMembership = await this.orgMemberRepository.findOne({
      where: { userId: user.id, organizationId: user.organizationId },
    });
    if (!existingMembership) {
      await this.orgMemberRepository.save(
        this.orgMemberRepository.create({
          userId: user.id,
          organizationId: user.organizationId,
          role: user.role || 'member',
          isDefault: true,
        }),
      );
    }

    const activatedUser = await this.usersService.findById(user.id);
    const tokens = await this.generateTokens(activatedUser, ipAddress, userAgent);

    this.auditService.log(
      activatedUser.organizationId,
      activatedUser.id,
      'auth.invitation_accepted',
      'user',
      activatedUser.id,
      { email: activatedUser.email },
      ipAddress,
    );

    return { user: activatedUser, ...tokens };
  }
```

- [ ] **Step 3: Build check**

```bash
cd /home/ubuntu/boardupscale/services/api
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add services/api/src/modules/auth/auth.service.ts
git commit -m "feat: use invitationStatus in validateInvitation and acceptInvitation with distinct error codes"
```

---

## Task 5: Organizations Service — Fix Invite/Resend/Revoke/UpdateEmail

**Files:**
- Modify: `services/api/src/modules/organizations/organizations.service.ts`

- [ ] **Step 1: Fix `inviteMember` — set `invitationStatus` on new users and handle `accepted` existing users**

Find the block that creates a new user (around line 127, `this.userRepository.create({...})`). Replace the `user` object creation:

```typescript
    // Create user without password (invitation pending)
    const user = this.userRepository.create({
      organizationId,
      email: dto.email,
      displayName: dto.displayName || dto.email.split('@')[0],
      passwordHash: null,
      role: dto.role || 'member',
      isActive: false,
      invitationStatus: 'pending',
      emailVerified: false,
    });
```

Also, find the block for existing users in another org (around line 91 where it adds to org_members) and add a check — if existing user is already `accepted`, skip sending an invite token and send a "you've been added" email instead:

```typescript
    if (existingUser) {
      const existingMembership = await this.organizationMemberRepository.findOne({
        where: { userId: existingUser.id, organizationId },
      });

      if (existingMembership) {
        throw new ConflictException('User is already a member of this organization');
      }

      await this.organizationMemberRepository
        .createQueryBuilder()
        .insert()
        .into(OrganizationMember)
        .values({
          userId: existingUser.id,
          organizationId,
          role: dto.role || 'member',
          isDefault: false,
        })
        .orIgnore()
        .execute();

      if (existingUser.invitationStatus === 'accepted') {
        // User already has an account — just notify them they were added
        const org = await this.organizationRepository.findOne({ where: { id: organizationId } });
        const inviter = await this.userRepository.findOne({ where: { id: inviterId } });
        await this.emailService.sendInvitationEmail(
          existingUser.email,
          inviter?.displayName || 'A team member',
          org?.name || 'your organization',
          (this.configService.get<string>('app.frontendUrl') || 'http://localhost:3000') + '/login',
        );
      } else {
        await this.generateAndSendInvitation(existingUser, inviterId, organizationId);
      }

      this.auditService.log(
        organizationId,
        inviterId,
        'organization.member.invited',
        'user',
        existingUser.id,
        { email: existingUser.email, role: dto.role || 'member', existingUser: true },
        null,
      );

      return existingUser;
    }
```

- [ ] **Step 2: Fix `resendInvitation` — allow `pending` and `expired` statuses**

Replace the `resendInvitation` method:

```typescript
  async resendInvitation(
    organizationId: string,
    memberId: string,
    actorId: string,
  ): Promise<void> {
    const member = await this.userRepository.findOne({
      where: { id: memberId },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const membership = await this.organizationMemberRepository.findOne({
      where: { userId: memberId, organizationId },
    });
    if (!membership && member.organizationId !== organizationId) {
      throw new NotFoundException('Member not found in this organization');
    }

    if (!['pending', 'expired'].includes(member.invitationStatus)) {
      throw new BadRequestException('Can only resend invite to members with pending or expired invitations');
    }

    await this.userRepository.update(memberId, { invitationStatus: 'pending' });
    const updated = await this.userRepository.findOne({ where: { id: memberId } });
    await this.generateAndSendInvitation(updated!, actorId, organizationId);
  }
```

- [ ] **Step 3: Fix `revokeInvitation` — use `invitationStatus` check**

Replace the `revokeInvitation` method:

```typescript
  async revokeInvitation(
    organizationId: string,
    memberId: string,
    actorId: string,
  ): Promise<void> {
    const member = await this.userRepository.findOne({
      where: { id: memberId },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const membership = await this.organizationMemberRepository.findOne({
      where: { userId: memberId, organizationId },
    });
    if (!membership && member.organizationId !== organizationId) {
      throw new NotFoundException('Member not found in this organization');
    }

    if (member.invitationStatus === 'accepted') {
      throw new BadRequestException('Cannot revoke — user is already active. Use deactivate instead.');
    }

    await this.userRepository.remove(member);

    this.auditService.log(
      organizationId,
      actorId,
      'organization.invitation.revoked',
      'user',
      memberId,
      { email: member.email },
      null,
    );
  }
```

- [ ] **Step 4: Fix `updateMigratedMemberEmail` — set `isActive=false` and `invitationStatus='pending'` before sending invite**

Find the block in `updateMigratedMemberEmail` where it saves the member and sends invitation (after the `existingUser` check that routes to merge). Replace:

```typescript
    member.email = newEmail;
    member.emailVerified = false;
    member.isActive = false;
    member.invitationStatus = 'pending';
    const saved = await this.userRepository.save(member);

    await this.generateAndSendInvitation(saved, actorId, organizationId);

    this.auditService.log(
      organizationId,
      actorId,
      'organization.member.email_updated',
      'user',
      memberId,
      { newEmail },
      null,
    );

    return saved;
```

- [ ] **Step 5: Fix `generateAndSendInvitation` — also set `invitationStatus='pending'`**

Find the `generateAndSendInvitation` private method. Replace the `userRepository.update` call inside it:

```typescript
    await this.userRepository.update(user.id, {
      emailVerificationToken: tokenHash,
      emailVerificationExpiry: expiresAt,
      invitationStatus: 'pending',
    });
```

- [ ] **Step 6: Build check**

```bash
cd /home/ubuntu/boardupscale/services/api
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add services/api/src/modules/organizations/organizations.service.ts
git commit -m "feat: update inviteMember, resend, revoke, updateMigratedMemberEmail to use invitationStatus"
```

---

## Task 6: Organizations Service — Add `getMergePreview` + Atomic Merge

**Files:**
- Modify: `services/api/src/modules/organizations/organizations.service.ts`

- [ ] **Step 1: Add `getMergePreview` method**

Add this new public method to `OrganizationsService` (before the private helpers section):

```typescript
  async getMergePreview(
    organizationId: string,
    memberId: string,
    targetEmail: string,
  ): Promise<{
    placeholder: { id: string; displayName: string; email: string };
    targetUser: { id: string; displayName: string; email: string } | null;
    impact: {
      issuesReassigned: number;
      commentsReassigned: number;
      projectMemberships: number;
      worklogsReassigned: number;
      watchersReassigned: number;
    };
    conflict: boolean;
  }> {
    const placeholder = await this.userRepository.findOne({ where: { id: memberId } });
    if (!placeholder) throw new NotFoundException('Member not found');

    const targetUser = await this.userRepository.findOne({ where: { email: targetEmail } });

    if (!targetUser) {
      return {
        placeholder: { id: placeholder.id, displayName: placeholder.displayName, email: placeholder.email },
        targetUser: null,
        impact: { issuesReassigned: 0, commentsReassigned: 0, projectMemberships: 0, worklogsReassigned: 0, watchersReassigned: 0 },
        conflict: false,
      };
    }

    const [issueCount, commentCount, projectCount, worklogCount, watcherCount] = await Promise.all([
      this.dataSource.query(
        `SELECT COUNT(*) FROM issues WHERE (assignee_id = $1 OR reporter_id = $1) AND organization_id = $2`,
        [memberId, organizationId],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) FROM comments WHERE author_id = $1 AND issue_id IN (SELECT id FROM issues WHERE organization_id = $2)`,
        [memberId, organizationId],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) FROM project_members WHERE user_id = $1 AND project_id IN (SELECT id FROM projects WHERE organization_id = $2)`,
        [memberId, organizationId],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) FROM work_logs WHERE user_id = $1 AND issue_id IN (SELECT id FROM issues WHERE organization_id = $2)`,
        [memberId, organizationId],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) FROM issue_watchers WHERE user_id = $1 AND issue_id IN (SELECT id FROM issues WHERE organization_id = $2)`,
        [memberId, organizationId],
      ),
    ]);

    const existingMembership = await this.organizationMemberRepository.findOne({
      where: { userId: targetUser.id, organizationId },
    });

    return {
      placeholder: { id: placeholder.id, displayName: placeholder.displayName, email: placeholder.email },
      targetUser: { id: targetUser.id, displayName: targetUser.displayName, email: targetUser.email },
      impact: {
        issuesReassigned: parseInt(issueCount[0].count, 10),
        commentsReassigned: parseInt(commentCount[0].count, 10),
        projectMemberships: parseInt(projectCount[0].count, 10),
        worklogsReassigned: parseInt(worklogCount[0].count, 10),
        watchersReassigned: parseInt(watcherCount[0].count, 10),
      },
      conflict: !!existingMembership,
    };
  }
```

- [ ] **Step 2: Update `updateMigratedMemberEmail` to return 409 with preview instead of auto-merging**

Replace the block that currently calls `mergeAndInviteExistingUser` directly when email is taken:

```typescript
    if (existingUser && existingUser.id !== memberId) {
      // Return 409 with merge preview — frontend must confirm before merge executes
      const preview = await this.getMergePreview(organizationId, memberId, newEmail);
      const conflict = new ConflictException('Email already belongs to an existing user');
      (conflict as any).response = {
        statusCode: 409,
        message: 'Email already belongs to an existing user',
        code: 'MERGE_REQUIRED',
        preview,
      };
      throw conflict;
    }
```

- [ ] **Step 3: Add `confirmMergeAndInvite` public method that triggers the atomic merge**

Add this new public method (calls the existing private `mergeAndInviteExistingUser`):

```typescript
  async confirmMergeAndInvite(
    organizationId: string,
    memberId: string,
    targetEmail: string,
    actorId: string,
  ): Promise<User> {
    const placeholder = await this.userRepository.findOne({ where: { id: memberId } });
    if (!placeholder) throw new NotFoundException('Placeholder member not found');

    const targetUser = await this.userRepository.findOne({ where: { email: targetEmail } });
    if (!targetUser) throw new NotFoundException('Target user not found');

    // Block merging into yourself or into an owner
    if (targetUser.id === actorId) {
      throw new BadRequestException('Cannot merge placeholder into your own account');
    }

    return this.mergeAndInviteExistingUser(organizationId, placeholder, targetUser, actorId);
  }
```

- [ ] **Step 4: Fix `mergeAndInviteExistingUser` to set `invitationStatus` correctly on target user**

Find in `mergeAndInviteExistingUser` the section after `this.dataSource.transaction(...)` completes. Add invitation status update inside the transaction, before the `generateAndSendInvitation` call. Inside the transaction block, after the `INSERT INTO organization_members` line, add:

```typescript
      // Set invitation status on target user if not already accepted
      const targetCurrentStatus = await manager.query(
        `SELECT invitation_status FROM users WHERE id = $1`,
        [realUserId],
      );
      if (targetCurrentStatus[0]?.invitation_status !== 'accepted') {
        await manager.query(
          `UPDATE users SET is_active = false, invitation_status = 'pending' WHERE id = $1`,
          [realUserId],
        );
      }
```

Also update the audit log call to include full impact data:

```typescript
    this.auditService.log(
      organizationId,
      actorId,
      'organization.member.merged',
      'user',
      existingUser.id,
      {
        placeholderUserId: placeholder.id,
        placeholderEmail: placeholder.email,
        targetUserId: existingUser.id,
        targetEmail: existingUser.email,
      },
      null,
    );
```

- [ ] **Step 5: Build check**

```bash
cd /home/ubuntu/boardupscale/services/api
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/modules/organizations/organizations.service.ts
git commit -m "feat: add getMergePreview, confirmMergeAndInvite, fix merge transaction and audit log"
```

---

## Task 7: Organizations Controller + DTO — New Endpoints

**Files:**
- Modify: `services/api/src/modules/organizations/organizations.controller.ts`
- Modify: `services/api/src/modules/organizations/dto/update-member-email.dto.ts`

- [ ] **Step 1: Update `UpdateMemberEmailDto` to accept `confirmMerge`**

Open `services/api/src/modules/organizations/dto/update-member-email.dto.ts`. Add the `confirmMerge` field:

```typescript
import { IsEmail, IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMemberEmailDto {
  @IsEmail()
  email: string;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Set true to confirm merging with an existing user' })
  confirmMerge?: boolean;
}
```

- [ ] **Step 2: Add `GET /organizations/me/members/:memberId/merge-preview` endpoint**

In `organizations.controller.ts`, add this endpoint after the existing `updateMemberEmail` endpoint:

```typescript
  @Get('me/members/:memberId/merge-preview')
  @ApiOperation({ summary: 'Preview the impact of merging a Jira placeholder with an existing user' })
  @Roles('admin', 'owner')
  async getMergePreview(
    @OrgId() organizationId: string,
    @Param('memberId') memberId: string,
    @Query('email') email: string,
  ) {
    const preview = await this.organizationsService.getMergePreview(organizationId, memberId, email);
    return { data: preview };
  }
```

Add `Query` to the NestJS imports at the top of the controller if not already present:
```typescript
import { ..., Query } from '@nestjs/common';
```

- [ ] **Step 3: Update `updateMemberEmail` endpoint to handle `confirmMerge`**

Replace the `updateMemberEmail` controller method:

```typescript
  @Patch('me/members/:memberId/email')
  @ApiOperation({ summary: 'Set real email for a Jira-migrated member. Returns 409 with preview if email is taken; resend with confirmMerge=true to proceed.' })
  @Roles('admin', 'owner')
  async updateMemberEmail(
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberEmailDto,
  ) {
    if (dto.confirmMerge === true) {
      const merged = await this.organizationsService.confirmMergeAndInvite(
        organizationId,
        memberId,
        dto.email,
        userId,
      );
      return { data: merged };
    }

    const updated = await this.organizationsService.updateMigratedMemberEmail(
      organizationId,
      memberId,
      dto.email,
      userId,
    );
    return { data: updated };
  }
```

- [ ] **Step 4: Build check**

```bash
cd /home/ubuntu/boardupscale/services/api
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/modules/organizations/organizations.controller.ts \
        services/api/src/modules/organizations/dto/update-member-email.dto.ts
git commit -m "feat: add merge-preview endpoint, confirmMerge param on PATCH /email"
```

---

## Task 8: Jira Migration — Fix User Flags + Phase 1b Project Member Sync

**Files:**
- Modify: `services/worker/src/migration/jira-migration.processor.ts`

- [ ] **Step 1: Add `PHASE_PROJECT_MEMBER_SYNC = 1.5` constant and update INSERT in Phase 1**

At the top of the file, after `const PHASE_MEMBERS = 1;`, add:

```typescript
const PHASE_PROJECT_MEMBER_SYNC = 15; // stored as 15 to avoid float keys; between phase 1 and 2
```

In the Phase 1 INSERT statement (the big bulk upsert), find:
```
`INSERT INTO users (id, email, display_name, organization_id, is_active, email_verified, role, jira_account_id, created_at, updated_at)
 VALUES ${placeholders.join(', ')}
 ON CONFLICT (email) DO UPDATE SET ...`
```

Replace with the version that includes `invitation_status`:

```typescript
    const { rows } = await client.query<{ id: string; email: string }>(
      `INSERT INTO users (id, email, display_name, organization_id, is_active, email_verified, role, jira_account_id, invitation_status, created_at, updated_at)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (email) DO UPDATE SET
         display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), users.display_name),
         jira_account_id = COALESCE(EXCLUDED.jira_account_id, users.jira_account_id),
         updated_at = NOW()
       RETURNING id, email`,
      params,
    ).catch((err: any) => { addError(state, `members bulk upsert: ${err.message}`); return { rows: [] as any[] }; });
```

Update the `placeholders` builder to include `invitation_status`:

Find the `chunk.forEach((u, j) => {` block. Change:
```typescript
      placeholders.push(`(gen_random_uuid(), $${b+1}::text, $${b+2}::text, $${b+3}::uuid, true, false, $${b+4}::text, $${b+5}::text, NOW(), NOW())`);
```
To:
```typescript
      // invitation_status: 'pending' if real email (invite will be sent), 'none' if synthetic
      const hasRealEmail = !!u.emailAddress;
      const invStatus = hasRealEmail ? 'pending' : 'none';
      placeholders.push(`(gen_random_uuid(), $${b+1}::text, $${b+2}::text, $${b+3}::uuid, ${hasRealEmail ? 'false' : 'true'}, false, $${b+4}::text, $${b+5}::text, '${invStatus}', NOW(), NOW())`);
```

Note: `is_active` is `false` for real-email users (they need to accept invite), `true` for synthetic-email users (they appear in dropdowns until real email is provided).

- [ ] **Step 2: Add `runProjectMemberSyncPhase` function**

Add this new function after `runMembersPhase` and before `runProjectsPhase`:

```typescript
// ─── Phase 1b: Project Member Sync ────────────────────────────────────────────

async function runProjectMemberSyncPhase(
  client: PoolClient,
  state: RunState,
  io: IORedis | null,
): Promise<void> {
  console.log(`[Migration:${state.id}] Phase 1b — project member sync`);

  // Get all projects in this migration
  const { rows: projects } = await client.query<{ id: string; key: string }>(
    `SELECT id, key FROM projects WHERE organization_id = $1`,
    [state.organizationId],
  );

  if (projects.length === 0) {
    console.log(`[Migration:${state.id}] Phase 1b — no projects found, skipping`);
    return;
  }

  let totalAssigned = 0;
  let projectsProcessed = 0;

  for (const project of projects) {
    // Collect distinct user IDs (via jira_account_id) who are assignee or reporter on issues in this project
    const { rows: accountIdRows } = await client.query<{ user_id: string }>(
      `SELECT DISTINCT u.id as user_id
       FROM issues i
       JOIN users u ON (u.jira_account_id = i.jira_assignee_id OR u.jira_account_id = i.jira_reporter_id)
       WHERE i.project_id = $1
         AND i.organization_id = $2
         AND u.organization_id = $2
         AND u.id IS NOT NULL`,
      [project.id, state.organizationId],
    ).catch(() => ({ rows: [] as any[] }));

    // Also collect via local user IDs mapped from assignee_id / reporter_id directly
    const { rows: directUserRows } = await client.query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM (
         SELECT assignee_id as user_id FROM issues WHERE project_id = $1 AND organization_id = $2 AND assignee_id IS NOT NULL
         UNION
         SELECT reporter_id as user_id FROM issues WHERE project_id = $1 AND organization_id = $2 AND reporter_id IS NOT NULL
       ) combined
       JOIN users u ON u.id = combined.user_id AND u.organization_id = $2`,
      [project.id, state.organizationId],
    ).catch(() => ({ rows: [] as any[] }));

    const userIds = [...new Set([
      ...accountIdRows.map((r) => r.user_id),
      ...directUserRows.map((r) => r.user_id),
    ])].filter(Boolean);

    if (userIds.length === 0) {
      projectsProcessed++;
      continue;
    }

    // Insert project_members for all inferred users — role derived from org-level role
    for (const userId of userIds) {
      const { rows: userRows } = await client.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [userId],
      );
      const role = userRows[0]?.role || 'member';

      await client.query(
        `INSERT INTO project_members (id, project_id, user_id, role, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [project.id, userId, role],
      ).catch((err: any) => {
        addError(state, `project_member_sync: project ${project.key} user ${userId}: ${err.message}`);
      });

      totalAssigned++;
    }

    projectsProcessed++;

    await updateRunProgress(client, state.id, {
      phase: 'project_member_sync',
      projectsProcessed,
      projectsTotal: projects.length,
    }, io);
  }

  console.log(`[Migration:${state.id}] Phase 1b done — ${totalAssigned} project memberships assigned across ${projectsProcessed} projects`);
}
```

- [ ] **Step 3: Wire Phase 1b into the main phase runner**

In the main orchestration (around line 1957), between Phase 1 completion and Phase 2 start, add:

```typescript
      // ── Phase 1b — project member sync ──────────────────────────────────────
      if (!completed.has(PHASE_PROJECT_MEMBER_SYNC)) {
        await runPhaseWithRetry('project_member_sync', state, () =>
          runProjectMemberSyncPhase(progressClient, state, io),
        );
        state.completedPhases = [...(state.completedPhases ?? []), PHASE_PROJECT_MEMBER_SYNC];
      }

      await checkCancelled(progressClient, runId);
```

Add this block AFTER the Phase 1 block and BEFORE the Phase 2 block.

- [ ] **Step 4: Build worker**

```bash
cd /home/ubuntu/boardupscale/services/worker
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add services/worker/src/migration/jira-migration.processor.ts
git commit -m "feat: fix Jira user creation flags, add Phase 1b project member sync"
```

---

## Task 9: Frontend Types — Add `invitationStatus`

**Files:**
- Modify: `services/web/src/types/index.ts`

- [ ] **Step 1: Add `invitationStatus` to `User` interface**

In `services/web/src/types/index.ts`, find the `User` interface (line 76). Add `invitationStatus` after `isActive`:

```typescript
export interface User {
  id: string
  organizationId: string
  email: string
  displayName: string
  avatarUrl?: string
  timezone: string
  language: string
  role: UserRole
  isActive: boolean
  invitationStatus: 'none' | 'pending' | 'accepted' | 'expired'
  emailVerified: boolean
  twoFaEnabled: boolean
  jiraAccountId?: string | null
  lastLoginAt?: string
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2: Build check**

```bash
cd /home/ubuntu/boardupscale/services/web
npx tsc --noEmit 2>&1 | head -30
```

Expected: Errors only where `invitationStatus` is used but not yet available (will fix in later tasks). If errors from this change propagate broadly, note them — they'll be fixed by Task 10.

- [ ] **Step 3: Commit**

```bash
git add services/web/src/types/index.ts
git commit -m "feat: add invitationStatus to User type"
```

---

## Task 10: Frontend Hooks — Update for Merge Flow

**Files:**
- Modify: `services/web/src/hooks/useOrganization.ts`

- [ ] **Step 1: Add `MergePreview` type and update `useUpdateMemberEmail` to handle 409**

At the top of `useOrganization.ts`, add the `MergePreview` type (before the first exported function):

```typescript
export interface MergePreviewImpact {
  issuesReassigned: number
  commentsReassigned: number
  projectMemberships: number
  worklogsReassigned: number
  watchersReassigned: number
}

export interface MergePreview {
  placeholder: { id: string; displayName: string; email: string }
  targetUser: { id: string; displayName: string; email: string } | null
  impact: MergePreviewImpact
  conflict: boolean
}
```

- [ ] **Step 2: Update `useUpdateMemberEmail` to surface 409 to the caller instead of toasting**

Replace the existing `useUpdateMemberEmail` hook:

```typescript
export function useUpdateMemberEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      memberId,
      email,
      confirmMerge,
    }: {
      memberId: string
      email: string
      confirmMerge?: boolean
    }) => {
      const { data } = await api.patch(`/organizations/me/members/${memberId}/email`, {
        email,
        confirmMerge,
      })
      return data.data as User
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['org-members'] })
      const msg = variables.confirmMerge
        ? `Accounts merged. Invitation sent to ${variables.email}`
        : 'Email updated — invitation sent'
      toast(msg)
    },
    // Do NOT add onError — let callers handle 409 themselves for merge flow
  })
}
```

- [ ] **Step 3: Add `useMergePreview` hook**

Add after `useUpdateMemberEmail`:

```typescript
export function useMergePreview(memberId: string, email: string, enabled: boolean) {
  return useQuery({
    queryKey: ['merge-preview', memberId, email],
    queryFn: async () => {
      const { data } = await api.get(
        `/organizations/me/members/${memberId}/merge-preview?email=${encodeURIComponent(email)}`,
      )
      return data.data as MergePreview
    },
    enabled: enabled && !!memberId && !!email,
    retry: false,
  })
}
```

- [ ] **Step 4: Update `useResendInvitation` to invalidate queries on success**

Replace the existing `useResendInvitation`:

```typescript
export function useResendInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { data } = await api.post(`/organizations/me/members/${memberId}/resend-invite`)
      return data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members'] })
      toast('Invitation resent')
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Failed to resend invitation', 'error')
    },
  })
}
```

- [ ] **Step 5: Build check**

```bash
cd /home/ubuntu/boardupscale/services/web
npx tsc --noEmit 2>&1 | head -30
```

Expected: Errors only if `useQuery` is not already imported. If so, add it to imports from `@tanstack/react-query`.

- [ ] **Step 6: Commit**

```bash
git add services/web/src/hooks/useOrganization.ts
git commit -m "feat: add MergePreview type, useMergePreview hook, update useUpdateMemberEmail for 409 flow"
```

---

## Task 11: New `MergeConfirmationModal` Component

**Files:**
- Create: `services/web/src/components/MergeConfirmationModal.tsx`

- [ ] **Step 1: Create the modal component**

```typescript
import { AlertTriangle, GitMerge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MergePreview } from '@/hooks/useOrganization'

interface Props {
  open: boolean
  preview: MergePreview | null
  loading: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function MergeConfirmationModal({ open, preview, loading, error, onConfirm, onCancel }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-card rounded-2xl shadow-xl border border-border w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <GitMerge className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Merge Accounts</h2>
          </div>
          <button
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ×
          </button>
        </div>

        {/* Body */}
        {preview ? (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              The email <strong className="text-foreground">{preview.targetUser?.email}</strong> already
              belongs to an existing member. Merging will transfer all activity from{' '}
              <strong className="text-foreground">{preview.placeholder.displayName}</strong> (Jira
              placeholder) to this account.
            </p>

            {/* Impact summary */}
            <div className="bg-muted/50 rounded-xl border border-border p-4 mb-4 grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Issues</span>
              <span className="font-medium text-foreground text-right">{preview.impact.issuesReassigned}</span>
              <span className="text-muted-foreground">Comments</span>
              <span className="font-medium text-foreground text-right">{preview.impact.commentsReassigned}</span>
              <span className="text-muted-foreground">Project memberships</span>
              <span className="font-medium text-foreground text-right">{preview.impact.projectMemberships}</span>
              <span className="text-muted-foreground">Work logs</span>
              <span className="font-medium text-foreground text-right">{preview.impact.worklogsReassigned}</span>
              <span className="text-muted-foreground">Watchers</span>
              <span className="font-medium text-foreground text-right">{preview.impact.watchersReassigned}</span>
            </div>

            {preview.conflict && (
              <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2 mb-4">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  This user is already a member of this organization. Their data will still be merged.
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground mb-5">This cannot be undone.</p>
          </>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2 mb-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!preview || loading}
            isLoading={loading}
          >
            Confirm Merge →
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build check**

```bash
cd /home/ubuntu/boardupscale/services/web
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add services/web/src/components/MergeConfirmationModal.tsx
git commit -m "feat: add MergeConfirmationModal component"
```

---

## Task 12: AcceptInvitePage — Distinct Error States

**Files:**
- Modify: `services/web/src/pages/auth/AcceptInvitePage.tsx`

- [ ] **Step 1: Add error code parsing and distinct error state map**

In `AcceptInvitePage.tsx`, replace the existing error state section and the error extraction in the `useEffect`:

Replace the `catch` block in the `useEffect` (lines 60–66):

```typescript
      .catch((err) => {
        const code: string =
          err?.response?.data?.code ||
          err?.response?.data?.data?.code ||
          'INVITE_INVALID'
        setErrorCode(code)
      })
```

Add `errorCode` state alongside `error`:

```typescript
  const [errorCode, setErrorCode] = useState('')
```

Remove the old `setError(...)` call in the catch block. Add an `errorCode` state initialised to `''`.

- [ ] **Step 2: Replace the generic error screen with code-specific screens**

Replace the single error block (lines 104–124):

```typescript
  const ERROR_SCREENS: Record<string, { heading: string; body: string; cta: boolean }> = {
    INVITE_ALREADY_ACCEPTED: {
      heading: 'Already Accepted',
      body: 'Your account is already active.',
      cta: true,
    },
    INVITE_EXPIRED: {
      heading: 'Invite Expired',
      body: 'This invite expired after 7 days. Ask your admin to resend it.',
      cta: true,
    },
    INVITE_INVALID: {
      heading: 'Invalid Link',
      body: 'This invite link is invalid or has already been used.',
      cta: true,
    },
    INVITE_NOT_SENT: {
      heading: 'No Invite Sent',
      body: "Your admin hasn't sent an invitation yet. Contact them to get access.",
      cta: false,
    },
  }

  if (!validating && errorCode && !inviteEmail) {
    const screen = ERROR_SCREENS[errorCode] ?? ERROR_SCREENS['INVITE_INVALID']
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center justify-center h-12 w-12 bg-red-100 rounded-xl mx-auto mb-4">
            <AlertCircle className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">{screen.heading}</h2>
          <p className="text-sm text-muted-foreground mb-6">{screen.body}</p>
          {screen.cta && (
            <Link to="/login" className="text-primary hover:text-primary text-sm font-medium">
              Go to Login
            </Link>
          )}
        </div>
      </div>
    )
  }
```

- [ ] **Step 3: Update form submission error display to also surface error codes**

In the form `onSubmit` catch block, also parse the error code:

```typescript
    } catch (err: any) {
      const code: string =
        err?.response?.data?.code ||
        err?.response?.data?.data?.code ||
        'INVITE_INVALID'
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.violations?.join('. ') ||
        'Failed to accept invitation'
      setErrorCode(code)
      setError(msg)
    }
```

- [ ] **Step 4: Build check**

```bash
cd /home/ubuntu/boardupscale/services/web
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add services/web/src/pages/auth/AcceptInvitePage.tsx
git commit -m "feat: distinct error screens per error code on AcceptInvitePage"
```

---

## Task 13: TeamPage — Status Badges + Merge Modal Integration

**Files:**
- Modify: `services/web/src/pages/TeamPage.tsx`

- [ ] **Step 1: Import `MergeConfirmationModal` and `useMergePreview`**

At the top of `TeamPage.tsx`, add to imports:

```typescript
import { MergeConfirmationModal } from '@/components/MergeConfirmationModal'
import { useMergePreview, type MergePreview } from '@/hooks/useOrganization'
```

- [ ] **Step 2: Add merge modal state**

In the component body, after existing state declarations, add:

```typescript
  const [mergeState, setMergeState] = useState<{
    memberId: string
    email: string
    open: boolean
    error: string | null
  } | null>(null)
  const [mergeLoading, setMergeLoading] = useState(false)

  const mergePreview = useMergePreview(
    mergeState?.memberId ?? '',
    mergeState?.email ?? '',
    !!mergeState?.open,
  )
```

- [ ] **Step 3: Update `useUpdateMemberEmail` call to handle 409**

Find where `updateMemberEmail.mutate(...)` is called in the dialog submit handler. Replace with:

```typescript
  const handleSaveEmail = async (memberId: string, email: string) => {
    try {
      await updateMemberEmail.mutateAsync({ memberId, email })
      setEmailDialogMember(null)
    } catch (err: any) {
      if (err?.response?.status === 409) {
        // Backend says email is taken — open merge confirmation
        setEmailDialogMember(null)
        setMergeState({ memberId, email, open: true, error: null })
      } else {
        toast(err?.response?.data?.message || 'Failed to update email', 'error')
      }
    }
  }
```

Update the "Save Email" button in the dialog to call `handleSaveEmail` instead of `mutate` directly.

- [ ] **Step 4: Add merge confirm handler**

```typescript
  const handleConfirmMerge = async () => {
    if (!mergeState) return
    setMergeLoading(true)
    try {
      await updateMemberEmail.mutateAsync({
        memberId: mergeState.memberId,
        email: mergeState.email,
        confirmMerge: true,
      })
      setMergeState(null)
    } catch (err: any) {
      setMergeState((prev) => prev ? { ...prev, error: err?.response?.data?.message || 'Merge failed. Please try again.' } : null)
    } finally {
      setMergeLoading(false)
    }
  }
```

- [ ] **Step 5: Replace `isActive`-based status derivation with `invitationStatus`**

Find lines 316–317:
```typescript
  const activeMembers = useMemo(() => members.filter((m) => m.isActive), [members])
  const pendingMembers = useMemo(() => members.filter((m) => !m.isActive), [members])
```

Replace with:
```typescript
  const activeMembers = useMemo(
    () => members.filter((m) => m.invitationStatus === 'accepted'),
    [members],
  )
  const pendingMembers = useMemo(
    () => members.filter((m) => ['pending', 'expired', 'none'].includes(m.invitationStatus)),
    [members],
  )
```

- [ ] **Step 6: Update pending member row — show `expired` badge in red**

Find the `Pending` badge span in the pending members render (around line 728):
```typescript
<span className="... bg-amber-100 ... text-amber-700 ...">
  Pending
</span>
```

Replace with:
```typescript
{member.invitationStatus === 'expired' ? (
  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700 flex-shrink-0 whitespace-nowrap">
    Invite Expired
  </span>
) : member.invitationStatus === 'none' ? (
  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700 flex-shrink-0 whitespace-nowrap">
    Migrated (no email)
  </span>
) : (
  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700 flex-shrink-0 whitespace-nowrap">
    Invite Pending
  </span>
)}
```

- [ ] **Step 7: Show Resend + Revoke only for `pending` and `expired` (not `none`)**

Wrap the resend/revoke buttons so they only appear for appropriate statuses:

```typescript
{isAdmin && member.invitationStatus !== 'none' && (
  <div className="flex items-center gap-1">
    <button
      onClick={() => resendInvitation.mutate(member.id)}
      title="Resend invitation"
      disabled={resendInvitation.isPending}
      className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/10 transition-colors disabled:opacity-50"
    >
      <RefreshCw className="h-3.5 w-3.5" />
    </button>
    <button
      onClick={() => setRevokeTarget(member)}
      title="Revoke invitation"
      className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  </div>
)}
```

- [ ] **Step 8: Add `MergeConfirmationModal` to the JSX return**

At the bottom of the component JSX (before the final closing tag), add:

```typescript
      <MergeConfirmationModal
        open={!!mergeState?.open}
        preview={mergePreview.data ?? null}
        loading={mergeLoading}
        error={mergeState?.error ?? null}
        onConfirm={handleConfirmMerge}
        onCancel={() => setMergeState(null)}
      />
```

- [ ] **Step 9: Build check**

```bash
cd /home/ubuntu/boardupscale/services/web
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add services/web/src/pages/TeamPage.tsx
git commit -m "feat: update TeamPage with invitationStatus badges, merge modal, resend/revoke guards"
```

---

## Task 14: Final Build Verification

- [ ] **Step 1: Build API**

```bash
cd /home/ubuntu/boardupscale/services/api
npm run build 2>&1 | tail -20
```

Expected: `Build complete` with no errors.

- [ ] **Step 2: Build Worker**

```bash
cd /home/ubuntu/boardupscale/services/worker
npm run build 2>&1 | tail -20
```

Expected: Build completes with no errors.

- [ ] **Step 3: Build Web**

```bash
cd /home/ubuntu/boardupscale/services/web
npm run build 2>&1 | tail -20
```

Expected: Build completes with no errors.

- [ ] **Step 4: Commit final build verification note**

```bash
git commit --allow-empty -m "chore: verify full build passes for invitation system overhaul"
```

---

## Self-Review Against Spec

| Spec requirement | Task |
|---|---|
| `invitation_status` column + backfill + index | Task 1 |
| User entity field | Task 2 |
| `activateInvitedUser` sets `accepted` | Task 3 |
| `validateInvitation` uses `invitationStatus`, distinct error codes | Task 4 |
| `acceptInvitation` uses `invitationStatus`, sets `emailVerified=true` | Task 4 |
| `inviteMember` sets `invitationStatus='pending'` on new users | Task 5 |
| Existing `accepted` user invited to new org → no token, "added" email | Task 5 |
| `resendInvitation` allows `pending` + `expired` | Task 5 |
| `revokeInvitation` blocks `accepted` users | Task 5 |
| `updateMigratedMemberEmail` sets `isActive=false`, `invitationStatus='pending'` | Task 5 |
| `generateAndSendInvitation` sets `invitationStatus='pending'` | Task 5 |
| `getMergePreview` endpoint + impact counts | Task 6 |
| `updateMigratedMemberEmail` returns 409 with preview instead of auto-merging | Task 6 |
| `confirmMergeAndInvite` atomic transaction | Task 6 |
| Merge sets target `invitationStatus` + `isActive` correctly | Task 6 |
| Merge audit log with full impact | Task 6 |
| `GET /merge-preview` controller endpoint | Task 7 |
| `PATCH /email` accepts `confirmMerge` | Task 7 |
| Jira migration: real email → `isActive=false`, `invitationStatus='pending'` | Task 8 |
| Jira migration: synthetic email → `isActive=true`, `invitationStatus='none'` | Task 8 |
| Phase 1b project member sync | Task 8 |
| `invitationStatus` in frontend `User` type | Task 9 |
| `useUpdateMemberEmail` surfaces 409 to caller | Task 10 |
| `useMergePreview` hook | Task 10 |
| `useResendInvitation` invalidates queries | Task 10 |
| `MergeConfirmationModal` with impact grid, conflict warning | Task 11 |
| `AcceptInvitePage` distinct error per code | Task 12 |
| TeamPage `invitationStatus`-based filtering | Task 13 |
| TeamPage expired badge (red) | Task 13 |
| TeamPage resend/revoke hidden for `none` status | Task 13 |
| Merge modal wired in TeamPage | Task 13 |
