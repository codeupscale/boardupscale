import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    // Merge: prefer membership users, add any legacy users not in the set
    const users = memberships.map((m) => m.user).filter(Boolean);
    for (const u of legacyUsers) {
      if (!memberUserIds.has(u.id)) {
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
      // Check if user is already a member of THIS organization (via organization_members)
      const existingMembership = await this.organizationMemberRepository.findOne({
        where: { userId: existingUser.id, organizationId },
      });

      if (existingMembership) {
        throw new ConflictException('User is already a member of this organization');
      }

      // User exists in another org -- add them to this org via organization_members
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

      // Send invitation email
      await this.generateAndSendInvitation(existingUser, inviterId, organizationId);

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

    // Create user without password (invitation pending)
    const user = this.userRepository.create({
      organizationId,
      email: dto.email,
      displayName: dto.displayName || dto.email.split('@')[0],
      passwordHash: null,
      role: dto.role || 'member',
      isActive: false,
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
      const ownerCount = await this.userRepository.count({
        where: { organizationId, role: 'owner', isActive: true },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot deactivate the only owner');
      }
    }

    await this.userRepository.update(memberId, { isActive: false });

    this.auditService.log(
      organizationId,
      actorId,
      'organization.member.deactivated',
      'user',
      memberId,
      { email: member.email },
      null,
    );
  }

  async resendInvitation(
    organizationId: string,
    memberId: string,
    actorId: string,
  ): Promise<void> {
    const member = await this.userRepository.findOne({
      where: { id: memberId, organizationId },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    if (member.isActive) {
      throw new BadRequestException('User is already active — not a pending invitation');
    }

    await this.generateAndSendInvitation(member, actorId, organizationId);
  }

  async revokeInvitation(
    organizationId: string,
    memberId: string,
    actorId: string,
  ): Promise<void> {
    const member = await this.userRepository.findOne({
      where: { id: memberId, organizationId },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    if (member.isActive) {
      throw new BadRequestException('Cannot revoke — user is already active');
    }

    // Hard-delete the pending user record
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

    // Ensure the new email is not already taken by another user
    const existing = await this.userRepository.findOne({
      where: { email: newEmail },
    });
    if (existing && existing.id !== memberId) {
      throw new ConflictException('Email is already in use by another account');
    }

    member.email = newEmail;
    member.emailVerified = false;
    const saved = await this.userRepository.save(member);

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
