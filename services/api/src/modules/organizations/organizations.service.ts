import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Organization } from './entities/organization.entity';
import { OrganizationMember } from './entities/organization-member.entity';
import { User } from '../users/entities/user.entity';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { EmailService } from '../notifications/email.service';
import { AuditService } from '../audit/audit.service';
import { PosthogService } from '../telemetry/posthog.service';
import { EventsGateway } from '../../websocket/events.gateway';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(OrganizationMember)
    private organizationMemberRepository: Repository<OrganizationMember>,
    private emailService: EmailService,
    private auditService: AuditService,
    private configService: ConfigService,
    private dataSource: DataSource,
    private posthogService: PosthogService,
    private gateway: EventsGateway,
  ) {}

  async findById(id: string): Promise<Organization> {
    const org = await this.organizationRepository.findOne({ where: { id } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto): Promise<Organization> {
    const org = await this.findById(id);
    Object.assign(org, dto);
    return this.organizationRepository.save(org);
  }

  async getMembers(organizationId: string): Promise<User[]> {
    // Query via organization_members join to support multi-org membership
    const memberships = await this.organizationMemberRepository.find({
      where: { organizationId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
    // Also include legacy users that have organizationId set directly
    const memberUserIds = new Set(memberships.map((m) => m.userId));
    const legacyUsers = await this.userRepository.find({
      where: { organizationId },
      order: { createdAt: 'ASC' },
    });
    // Merge: prefer membership users, add any legacy users not in the set.
    // Membership users are always included regardless of isActive — a pending-invite
    // migrated user has isActive=false but a valid org_member row and must show up.
    // Legacy users (no membership row) are filtered by isActive so old deactivations
    // (which set isActive=false without deleting a row) still take effect.
    const users = memberships.map((m) => m.user).filter(Boolean);
    for (const u of legacyUsers) {
      if (!memberUserIds.has(u.id) && u.isActive !== false) {
        users.push(u);
      }
    }
    return users;
  }

  async inviteMember(
    organizationId: string,
    dto: InviteMemberDto,
    inviterId: string,
  ): Promise<User> {
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });

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
        // User already has an active account — just notify them they were added
        const org = await this.organizationRepository.findOne({ where: { id: organizationId } });
        const inviter = await this.userRepository.findOne({ where: { id: inviterId } });
        const frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3000';
        await this.emailService.sendInvitationEmail(
          existingUser.email,
          inviter?.displayName || 'A team member',
          org?.name || 'your organization',
          `${frontendUrl}/login`,
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

      this.notifyOrgMembersChanged(organizationId);
      return existingUser;
    }

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

    const saved = await this.userRepository.save(user);

    // Also create an organization_members entry
    await this.organizationMemberRepository
      .createQueryBuilder()
      .insert()
      .into(OrganizationMember)
      .values({
        userId: saved.id,
        organizationId,
        role: dto.role || 'member',
        isDefault: true,
      })
      .orIgnore()
      .execute();

    // Generate invitation token and store hash
    await this.generateAndSendInvitation(saved, inviterId, organizationId);

    // PostHog analytics
    this.posthogService.capture(inviterId, 'organization_member_invited', {
      organizationId,
      invitedEmail: dto.email,
      role: dto.role || 'member',
    });

    this.notifyOrgMembersChanged(organizationId);
    return saved;
  }

  async updateMemberInfo(
    organizationId: string,
    memberId: string,
    dto: { displayName?: string; avatarUrl?: string },
    actorId: string,
  ): Promise<User> {
    const member = await this.userRepository.findOne({
      where: { id: memberId, organizationId },
    });
    if (!member) throw new NotFoundException('Member not found');

    if (dto.displayName !== undefined) member.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) member.avatarUrl = dto.avatarUrl;
    const saved = await this.userRepository.save(member);

    this.auditService.log(
      organizationId,
      actorId,
      'organization.member.updated',
      'user',
      memberId,
      dto,
      null,
    );

    this.notifyOrgMembersChanged(organizationId);
    return saved;
  }

  async updateMemberRole(
    organizationId: string,
    memberId: string,
    newRole: string,
    actorId: string,
  ): Promise<User> {
    const member = await this.userRepository.findOne({
      where: { id: memberId, organizationId },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Prevent removing the last owner
    if (member.role === 'owner' && newRole !== 'owner') {
      const ownerCount = await this.userRepository.count({
        where: { organizationId, role: 'owner', isActive: true },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot change role: this is the only owner');
      }
    }

    member.role = newRole;
    const saved = await this.userRepository.save(member);

    this.auditService.log(
      organizationId,
      actorId,
      'organization.member.role_changed',
      'user',
      memberId,
      { newRole, previousRole: member.role },
      null,
    );

    this.notifyOrgMembersChanged(organizationId);
    return saved;
  }

  async deactivateMember(
    organizationId: string,
    memberId: string,
    actorId: string,
  ): Promise<void> {
    if (memberId === actorId) {
      throw new BadRequestException('Cannot deactivate your own account');
    }

    // Check via organization_members first, fall back to legacy organizationId
    const membership = await this.organizationMemberRepository.findOne({
      where: { userId: memberId, organizationId },
    });
    const member = await this.userRepository.findOne({
      where: { id: memberId },
    });
    if (!member || (!membership && member.organizationId !== organizationId)) {
      throw new NotFoundException('Member not found');
    }

    // Prevent deactivating the last owner
    if (member.role === 'owner') {
      const ownerCount = await this.organizationMemberRepository.count({
        where: { organizationId, role: 'owner' },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot deactivate the only owner');
      }
    }

    // Remove the org-scoped membership row so the user loses access to THIS org only
    if (membership) {
      await this.organizationMemberRepository.remove(membership);
    }

    // For legacy users (no membership row, organizationId set directly on user):
    // clear their organizationId so getMembers legacy path no longer includes them
    if (!membership && member.organizationId === organizationId) {
      await this.userRepository.update(memberId, { isActive: false });
    }

    // Disable login only if the user has no remaining org memberships
    const remainingMemberships = await this.organizationMemberRepository.count({
      where: { userId: memberId },
    });
    if (remainingMemberships === 0 && membership) {
      await this.userRepository.update(memberId, { isActive: false });
    }

    this.auditService.log(
      organizationId,
      actorId,
      'organization.member.deactivated',
      'user',
      memberId,
      { email: member.email },
      null,
    );

    this.notifyOrgMembersChanged(organizationId);
  }

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

    this.notifyOrgMembersChanged(organizationId);
  }

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

    if (member.invitationStatus === 'none') {
      throw new BadRequestException(
        'Cannot revoke a Jira-migrated placeholder. Update their email address first.',
      );
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

    this.notifyOrgMembersChanged(organizationId);
  }

  async updateMigratedMemberEmail(
    organizationId: string,
    memberId: string,
    newEmail: string,
    actorId: string,
  ): Promise<User> {
    // Verify membership — check via organization_members first, fall back to legacy organizationId
    const membership = await this.organizationMemberRepository.findOne({
      where: { userId: memberId, organizationId },
    });
    const member = await this.userRepository.findOne({ where: { id: memberId } });
    if (!member || (!membership && member.organizationId !== organizationId)) {
      throw new NotFoundException('Member not found');
    }

    // Only allow update if email is synthetic OR user was migrated from Jira
    const isSyntheticEmail = member.email.endsWith('@migrated.jira.local');
    const isMigratedUser = !!member.jiraAccountId;
    if (!isSyntheticEmail && !isMigratedUser) {
      throw new BadRequestException(
        'Email can only be updated for Jira-migrated members',
      );
    }

    // Check if the new email is already taken by another user
    const existingUser = await this.userRepository.findOne({
      where: { email: newEmail },
    });

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

    this.notifyOrgMembersChanged(organizationId);
    return saved;
  }

  /**
   * Merge a Jira-migrated placeholder user into an existing real user.
   * Reassigns all data (issues, comments, project memberships, work logs, watchers)
   * from the placeholder to the real user, adds the real user to this org, and sends an invitation.
   * Audit log entries are intentionally left as-is — they are an immutable audit trail.
   */
  private async mergeAndInviteExistingUser(
    organizationId: string,
    placeholder: User,
    existingUser: User,
    actorId: string,
  ): Promise<User> {
    // Check if the existing user is already a member of this org
    const existingMembership = await this.organizationMemberRepository.findOne({
      where: { userId: existingUser.id, organizationId },
    });

    await this.dataSource.transaction(async (manager) => {
      const placeholderId = placeholder.id;
      const realUserId = existingUser.id;

      // Reassign all references from placeholder to real user within this org
      // Issues: assignee and reporter
      await manager.query(
        `UPDATE issues SET assignee_id = $1 WHERE assignee_id = $2 AND organization_id = $3`,
        [realUserId, placeholderId, organizationId],
      );
      await manager.query(
        `UPDATE issues SET reporter_id = $1 WHERE reporter_id = $2 AND organization_id = $3`,
        [realUserId, placeholderId, organizationId],
      );

      // Comments (scoped through issue's organization_id)
      await manager.query(
        `UPDATE comments SET author_id = $1 WHERE author_id = $2
         AND issue_id IN (SELECT id FROM issues WHERE organization_id = $3)`,
        [realUserId, placeholderId, organizationId],
      );

      // NOTE: audit_logs are intentionally not reassigned — they are an immutable
      // audit trail and the table is named audit_logs, not activity.

      // Work logs (scoped through issue's organization_id)
      await manager.query(
        `UPDATE work_logs SET user_id = $1 WHERE user_id = $2
         AND issue_id IN (SELECT id FROM issues WHERE organization_id = $3)`,
        [realUserId, placeholderId, organizationId],
      );

      // Issue watchers
      await manager.query(
        `UPDATE issue_watchers SET user_id = $1 WHERE user_id = $2
         AND issue_id IN (SELECT id FROM issues WHERE organization_id = $3)
         AND NOT EXISTS (SELECT 1 FROM issue_watchers WHERE user_id = $1 AND issue_id = issue_watchers.issue_id)`,
        [realUserId, placeholderId, organizationId],
      );

      // Project members — transfer or skip if already exists
      await manager.query(
        `UPDATE project_members SET user_id = $1 WHERE user_id = $2
         AND project_id IN (SELECT id FROM projects WHERE organization_id = $3)
         AND NOT EXISTS (SELECT 1 FROM project_members WHERE user_id = $1 AND project_id = project_members.project_id)`,
        [realUserId, placeholderId, organizationId],
      );

      // Copy jiraAccountId to real user only if:
      //   1. placeholder actually has one, AND
      //   2. real user does not already have one, AND
      //   3. no other user holds that accountId (unique constraint guard)
      if (placeholder.jiraAccountId && !existingUser.jiraAccountId) {
        const conflict: { id: string }[] = await manager.query(
          `SELECT id FROM users WHERE jira_account_id = $1 AND id != $2 LIMIT 1`,
          [placeholder.jiraAccountId, realUserId],
        );
        if (conflict.length === 0) {
          await manager.query(
            `UPDATE users SET jira_account_id = $1 WHERE id = $2`,
            [placeholder.jiraAccountId, realUserId],
          );
        }
        // If another user already owns this jira_account_id, skip silently —
        // the merge still succeeds; only the accountId link is not transferred.
      }

      // Remove the placeholder's org membership and delete the placeholder user
      await manager.query(
        `DELETE FROM organization_members WHERE user_id = $1 AND organization_id = $2`,
        [placeholderId, organizationId],
      );

      // Clean up remaining references to placeholder before deleting
      await manager.query(
        `DELETE FROM issue_watchers WHERE user_id = $1
         AND issue_id IN (SELECT id FROM issues WHERE organization_id = $2)`,
        [placeholderId, organizationId],
      );
      await manager.query(
        `DELETE FROM project_members WHERE user_id = $1
         AND project_id IN (SELECT id FROM projects WHERE organization_id = $2)`,
        [placeholderId, organizationId],
      );

      // Delete placeholder if it has no memberships in any other org
      const remainingMemberships = await manager.query(
        `SELECT COUNT(*) as count FROM organization_members WHERE user_id = $1`,
        [placeholderId],
      );
      if (parseInt(remainingMemberships[0].count, 10) === 0) {
        await manager.query(`DELETE FROM users WHERE id = $1`, [placeholderId]);
      }

      // Add real user to this org if not already a member
      if (!existingMembership) {
        await manager.query(
          `INSERT INTO organization_members (user_id, organization_id, role, is_default)
           VALUES ($1, $2, 'member', false)
           ON CONFLICT (user_id, organization_id) DO NOTHING`,
          [realUserId, organizationId],
        );
      }

      // Set invitation status on target user if not already accepted
      const targetStatusRows = await manager.query(
        `SELECT invitation_status FROM users WHERE id = $1`,
        [realUserId],
      );
      if (targetStatusRows[0]?.invitation_status !== 'accepted') {
        await manager.query(
          `UPDATE users SET is_active = false, invitation_status = 'pending' WHERE id = $1`,
          [realUserId],
        );
      }
    });

    // Send invitation email to the existing user for this org
    await this.generateAndSendInvitation(existingUser, actorId, organizationId);

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

    return existingUser;
  }

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

    // Verify placeholder belongs to this organization
    const placeholderMembership = await this.organizationMemberRepository.findOne({
      where: { userId: memberId, organizationId },
    });
    if (!placeholderMembership && placeholder.organizationId !== organizationId) {
      throw new NotFoundException('Member not found in this organization');
    }

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

    if (targetUser.id === actorId) {
      throw new BadRequestException('Cannot merge placeholder into your own account');
    }

    const result = await this.mergeAndInviteExistingUser(organizationId, placeholder, targetUser, actorId);
    this.notifyOrgMembersChanged(organizationId);
    return result;
  }

  async repairOrgMemberships(
    organizationId: string,
  ): Promise<{ repairedOrgMembers: number; repairedProjectMembers: number }> {
    // Steps 2a/2b/3 run first so that newly added project_members rows are visible
    // when Step 1 backfills organization_members. Running Step 1 last ensures every
    // user added by the three project_members inserts also gets an org membership row.

    // Step 2a: Re-sync assignees → project_members
    const assigneeResult = await this.dataSource.query(
      `INSERT INTO project_members (id, project_id, user_id, role, created_at)
       SELECT gen_random_uuid(), i.project_id, i.assignee_id, 'member', NOW()
       FROM issues i
       JOIN projects p ON p.id = i.project_id AND p.organization_id = $1
       WHERE i.assignee_id IS NOT NULL
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [organizationId],
    );

    // Step 2b: Re-sync reporters → project_members
    const reporterResult = await this.dataSource.query(
      `INSERT INTO project_members (id, project_id, user_id, role, created_at)
       SELECT gen_random_uuid(), i.project_id, i.reporter_id, 'member', NOW()
       FROM issues i
       JOIN projects p ON p.id = i.project_id AND p.organization_id = $1
       WHERE i.reporter_id IS NOT NULL
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [organizationId],
    );

    // Step 3: Re-sync comment authors → project_members
    const commentResult = await this.dataSource.query(
      `INSERT INTO project_members (id, project_id, user_id, role, created_at)
       SELECT gen_random_uuid(), i.project_id, c.author_id, 'member', NOW()
       FROM comments c
       JOIN issues i ON i.id = c.issue_id
       JOIN projects p ON p.id = i.project_id AND p.organization_id = $1
       WHERE c.author_id IS NOT NULL
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [organizationId],
    );

    // Step 1 (runs last): Ensure every user who has project_members in this org also has
    // organization_members — including those just added above. Use literal 'member' since
    // users.role is a system-level field and must not bleed into org membership role.
    const orgMembersResult = await this.dataSource.query(
      `INSERT INTO organization_members (id, user_id, organization_id, role, is_default, created_at, updated_at)
       SELECT
         gen_random_uuid(),
         pm.user_id,
         p.organization_id,
         'member',
         false,
         NOW(),
         NOW()
       FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
       WHERE p.organization_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM organization_members om
           WHERE om.user_id = pm.user_id AND om.organization_id = p.organization_id
         )
       ON CONFLICT (user_id, organization_id) DO NOTHING`,
      [organizationId],
    );

    const repairedOrgMembers = orgMembersResult?.rowCount ?? 0;
    const repairedProjectMembers =
      (assigneeResult?.rowCount ?? 0) +
      (reporterResult?.rowCount ?? 0) +
      (commentResult?.rowCount ?? 0);

    return { repairedOrgMembers, repairedProjectMembers };
  }

  async bulkInvitePending(
    organizationId: string,
  ): Promise<{ sent: number; skipped: number }> {
    // Find all pending-status members in this org
    const pendingUsers = await this.userRepository.find({
      where: {
        organizationId,
        invitationStatus: 'pending',
      } as any,
    });

    // Filter: skip synthetic emails and users with a still-valid token
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
      // Pass organizationId as inviterId — system-level action, no human inviter.
      // generateAndSendInvitation will resolve inviter to null → falls back to 'A team member'.
      await this.generateAndSendInvitation(user, organizationId, organizationId);
    }

    return { sent: toInvite.length, skipped };
  }

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

  // ── SAML SSO Configuration ─────────────────────────────────────────────

  async getSamlConfig(organizationId: string): Promise<{
    entryPoint: string;
    issuer: string;
    certificate: string;
    callbackUrl?: string;
  } | null> {
    const org = await this.findById(organizationId);
    if (!org.settings?.saml) {
      return null;
    }
    const saml = org.settings.saml;
    return {
      entryPoint: saml.entryPoint || '',
      issuer: saml.issuer || '',
      certificate: saml.certificate || '',
      callbackUrl: saml.callbackUrl || '',
    };
  }

  async setSamlConfig(
    organizationId: string,
    dto: { entryPoint: string; issuer: string; certificate: string; callbackUrl?: string },
    actorId: string,
  ): Promise<void> {
    const org = await this.findById(organizationId);
    const settings = org.settings || {};
    settings.saml = {
      entryPoint: dto.entryPoint,
      issuer: dto.issuer,
      certificate: dto.certificate,
      callbackUrl: dto.callbackUrl || '',
    };

    await this.organizationRepository.update(organizationId, { settings });

    this.auditService.log(
      organizationId,
      actorId,
      'organization.saml.configured',
      'organization',
      organizationId,
      { issuer: dto.issuer, entryPoint: dto.entryPoint },
      null,
    );
  }

  async deleteSamlConfig(
    organizationId: string,
    actorId: string,
  ): Promise<void> {
    const org = await this.findById(organizationId);
    const settings = org.settings || {};
    delete settings.saml;

    await this.organizationRepository.update(organizationId, { settings });

    this.auditService.log(
      organizationId,
      actorId,
      'organization.saml.removed',
      'organization',
      organizationId,
      null,
      null,
    );
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private notifyOrgMembersChanged(organizationId: string): void {
    this.gateway.emitToOrg(organizationId, 'org:members:changed', {});
  }

  private async generateAndSendInvitation(
    user: User,
    inviterId: string,
    organizationId: string,
  ): Promise<void> {
    const rawToken = uuidv4();
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

    await this.userRepository.update(user.id, {
      emailVerificationToken: tokenHash,
      emailVerificationExpiry: expiresAt,
      invitationStatus: 'pending',
    });

    const frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3000';
    const inviteUrl = `${frontendUrl}/accept-invite?token=${rawToken}`;

    const inviter = await this.userRepository.findOne({ where: { id: inviterId } });
    const org = await this.organizationRepository.findOne({ where: { id: organizationId } });

    await this.emailService.sendInvitationEmail(
      user.email,
      inviter?.displayName || 'A team member',
      org?.name || 'your organization',
      inviteUrl,
    );

    this.auditService.log(
      organizationId,
      inviterId,
      'organization.member.invited',
      'user',
      user.id,
      { email: user.email, role: user.role },
      null,
    );
  }
}
