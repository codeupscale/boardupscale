import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  HttpException,
  // HttpStatus used below; 423 is HTTP Locked (not in NestJS enum)
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { generateSecret, generateURI, verify as otpVerify } from 'otplib';
import * as QRCode from 'qrcode';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PasswordPolicyService } from './password-policy.service';
import { EmailService } from '../notifications/email.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';
import { RegisterDto } from './dto/register.dto';
import { AuditService } from '../audit/audit.service';
import { PosthogService } from '../telemetry/posthog.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private orgMemberRepository: Repository<OrganizationMember>,
    private usersService: UsersService,
    private emailService: EmailService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private passwordPolicyService: PasswordPolicyService,
    @InjectQueue('email') private emailQueue: Queue,
    private auditService: AuditService,
    private posthogService: PosthogService,
    private organizationsService: OrganizationsService,
  ) {}

  // ── Validate User (with account lockout) ──────────────────────────────────

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return null;
    }

    // OAuth-only accounts have no password hash — reject password login gracefully
    if (!user.passwordHash) {
      return null;
    }

    // Check if account is locked
    if (this.usersService.isAccountLocked(user)) {
      const lockedUntil = new Date(user.lockedUntil);
      const minutesLeft = Math.ceil(
        (lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new HttpException(
        {
          message: `Account is locked due to too many failed login attempts. Try again in ${minutesLeft} minute(s).`,
          lockedUntil: lockedUntil.toISOString(),
        },
        423,
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      // Increment failed attempts
      const attempts = await this.usersService.incrementFailedAttempts(user.id);
      if (attempts >= 5) {
        throw new HttpException(
          {
            message:
              'Account has been locked for 15 minutes due to too many failed login attempts.',
          },
          423,
        );
      }
      return null;
    }

    if (!user.isActive) {
      return null;
    }

    // Reset failed attempts on successful validation
    if (user.failedLoginAttempts > 0) {
      await this.usersService.resetFailedAttempts(user.id);
    }

    return user;
  }

  // ── Register ──────────────────────────────────────────────────────────────

  async register(dto: RegisterDto, ipAddress?: string, userAgent?: string) {
    // Enforce password policy
    this.passwordPolicyService.validate(dto.password);

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const slug = this.generateSlug(dto.organizationName);
    const existingSlug = await this.organizationRepository.findOne({
      where: { slug },
    });
    const finalSlug = existingSlug ? `${slug}-${Date.now()}` : slug;

    const organization = this.organizationRepository.create({
      name: dto.organizationName,
      slug: finalSlug,
    });
    const savedOrg = await this.organizationRepository.save(organization);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      organizationId: savedOrg.id,
      email: dto.email,
      displayName: dto.displayName,
      passwordHash,
      role: 'owner',
    });

    // Dual-write: create organization_members row for the founding user
    await this.orgMemberRepository.save(
      this.orgMemberRepository.create({
        userId: user.id,
        organizationId: savedOrg.id,
        role: 'owner',
        isDefault: true,
      }),
    );

    // Auto-send verification email on registration
    await this.sendVerificationEmail(user.id, user.email);

    const tokens = await this.generateTokens(user, ipAddress, userAgent);

    // Send welcome email asynchronously via BullMQ
    this.emailService
      .sendWelcomeEmail(user.email, user.displayName, savedOrg.name)
      .catch((err) => {
        // Non-blocking: log but don't fail the registration
        console.error('Failed to enqueue welcome email:', err.message);
      });

    // Audit log for registration
    this.auditService.log(
      savedOrg.id,
      user.id,
      'auth.register',
      'user',
      user.id,
      { email: dto.email, organizationName: dto.organizationName },
      ipAddress,
    );

    // PostHog analytics
    this.posthogService.identify(user.id, {
      email: user.email,
      displayName: user.displayName,
      organizationId: savedOrg.id,
      organizationName: savedOrg.name,
      role: 'owner',
    });
    this.posthogService.capture(user.id, 'user_signed_up', {
      organizationId: savedOrg.id,
      organizationName: savedOrg.name,
    });

    return { user, ...tokens };
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(user: any, ipAddress?: string, userAgent?: string) {
    // Check if 2FA is enabled
    if (user.twoFaEnabled) {
      const tempToken = this.jwtService.sign(
        { sub: user.id, purpose: '2fa' },
        {
          secret: this.configService.get<string>('jwt.secret'),
          expiresIn: '5m',
        },
      );
      return { requiresTwoFactor: true, tempToken };
    }

    await this.usersService.updateLastLogin(user.id);
    const tokens = await this.generateTokens(user, ipAddress, userAgent);

    // Audit log for login
    this.auditService.log(
      user.organizationId,
      user.id,
      'auth.login',
      'user',
      user.id,
      { email: user.email },
      ipAddress,
    );

    return { user, ...tokens };
  }

  // ── Token generation ──────────────────────────────────────────────────────

  async generateTokens(
    user: any,
    ipAddress?: string,
    userAgent?: string,
    activeOrganizationId?: string,
  ) {
    const organizationId = activeOrganizationId || user.organizationId;
    let role = user.role;

    // Always resolve the org membership role — more accurate than users.role for org context.
    // This ensures admins/owners set at the org level are never downgraded to 'member' in the JWT.
    if (organizationId) {
      const membership = await this.orgMemberRepository.findOne({
        where: { userId: user.id, organizationId },
      });
      if (membership) {
        role = membership.role;
      }
    }

    const payload = {
      sub: user.id,
      email: user.email,
      organizationId,
      role,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.expiry'),
    });

    const refreshTokenValue = uuidv4();
    const refreshTokenHash = this.hashToken(refreshTokenValue);

    const expiryDays = 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    const refreshToken = this.refreshTokenRepository.create({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt,
      ipAddress,
      userAgent,
    });
    await this.refreshTokenRepository.save(refreshToken);

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      expiresIn: 900,
      organizationId,
    };
  }

  // ── Refresh token ─────────────────────────────────────────────────────────

  async refreshToken(
    token: string,
    ipAddress?: string,
    userAgent?: string,
    activeOrganizationId?: string,
  ) {
    const tokenHash = this.hashToken(token);
    const stored = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    await this.refreshTokenRepository.update(stored.id, {
      revokedAt: new Date(),
    });

    // Preserve the active org context through token refresh
    const tokens = await this.generateTokens(
      stored.user,
      ipAddress,
      userAgent,
      activeOrganizationId,
    );
    return tokens;
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(userId: string, refreshToken?: string, organizationId?: string, ipAddress?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.refreshTokenRepository.update(
        { userId, tokenHash },
        { revokedAt: new Date() },
      );
    } else {
      await this.refreshTokenRepository
        .createQueryBuilder()
        .update()
        .set({ revokedAt: new Date() })
        .where('user_id = :userId AND revoked_at IS NULL', { userId })
        .execute();
    }

    // Audit log for logout
    if (organizationId) {
      this.auditService.log(
        organizationId,
        userId,
        'auth.logout',
        'user',
        userId,
        null,
        ipAddress,
      );
    }
  }

  // ── Email Verification ────────────────────────────────────────────────────

  async sendVerificationEmail(userId: string, email: string): Promise<void> {
    const rawToken = uuidv4();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24-hour expiry

    await this.usersService.setEmailVerificationToken(
      userId,
      tokenHash,
      expiresAt,
    );

    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    const verificationUrl = `${frontendUrl}/verify-email?token=${rawToken}`;

    await this.emailQueue.add('email-verification', {
      to: email,
      verificationUrl,
    });
  }

  async verifyEmail(rawToken: string): Promise<{ message: string }> {
    const tokenHash = this.hashToken(rawToken);
    const user =
      await this.usersService.findByEmailVerificationToken(tokenHash);

    if (!user) {
      throw new BadRequestException('Invalid verification token');
    }

    if (
      user.emailVerificationExpiry &&
      new Date(user.emailVerificationExpiry) < new Date()
    ) {
      throw new BadRequestException(
        'Verification token has expired. Please request a new one.',
      );
    }

    await this.usersService.markEmailVerified(user.id);
    return { message: 'Email verified successfully' };
  }

  async resendVerificationEmail(userId: string): Promise<{ message: string }> {
    const user = await this.usersService.findById(userId);
    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }
    await this.sendVerificationEmail(user.id, user.email);
    return { message: 'Verification email sent' };
  }

  // ── Password Reset ────────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<{ message: string }> {
    // Always return success to prevent email enumeration
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return {
        message:
          'If an account with that email exists, a password reset link has been sent.',
      };
    }

    const rawToken = uuidv4();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1-hour expiry

    await this.usersService.setPasswordResetToken(
      user.id,
      tokenHash,
      expiresAt,
    );

    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    await this.emailQueue.add('password-reset', {
      to: user.email,
      resetUrl,
    });

    return {
      message:
        'If an account with that email exists, a password reset link has been sent.',
    };
  }

  async resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    // Enforce password policy on the new password
    this.passwordPolicyService.validate(newPassword);

    const tokenHash = this.hashToken(rawToken);
    const user = await this.usersService.findByPasswordResetToken(tokenHash);

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (
      user.passwordResetExpiry &&
      new Date(user.passwordResetExpiry) < new Date()
    ) {
      throw new BadRequestException(
        'Reset token has expired. Please request a new one.',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.usersService.resetPassword(user.id, passwordHash);

    return { message: 'Password has been reset successfully' };
  }

  // ── Change Password (with policy) ────────────────────────────────────────

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    // Enforce password policy on the new password
    this.passwordPolicyService.validate(newPassword);
    await this.usersService.changePassword(userId, currentPassword, newPassword);
  }

  // ── OAuth ─────────────────────────────────────────────────────────────────

  async findOrCreateOAuthUser(
    provider: string,
    profile: {
      oauthId: string;
      email: string;
      displayName: string;
      avatarUrl?: string;
    },
  ) {
    // First try to find by OAuth provider + id
    const existingOAuth = await this.usersService.findByOAuth(
      provider,
      profile.oauthId,
    );
    if (existingOAuth) {
      await this.usersService.updateLastLogin(existingOAuth.id);
      return existingOAuth;
    }

    // Then try to find by email and link the OAuth account
    const existingEmail = await this.usersService.findByEmail(profile.email);
    if (existingEmail) {
      await this.usersService.linkOAuthProvider(
        existingEmail.id,
        provider,
        profile.oauthId,
      );
      await this.usersService.updateLastLogin(existingEmail.id);
      // Ensure org membership exists (idempotent — ON CONFLICT DO NOTHING via save)
      const existingMembership = await this.orgMemberRepository.findOne({
        where: { userId: existingEmail.id, organizationId: existingEmail.organizationId },
      });
      if (!existingMembership) {
        await this.orgMemberRepository.save(
          this.orgMemberRepository.create({
            userId: existingEmail.id,
            organizationId: existingEmail.organizationId,
            role: existingEmail.role || 'member',
            isDefault: true,
          }),
        );
      }
      return existingEmail;
    }

    // Create a new user with a default personal organization
    const slug = this.generateSlug(profile.displayName);
    const existingSlug = await this.organizationRepository.findOne({
      where: { slug },
    });
    const finalSlug = existingSlug ? `${slug}-${Date.now()}` : slug;

    const organization = this.organizationRepository.create({
      name: `${profile.displayName}'s Workspace`,
      slug: finalSlug,
    });
    const savedOrg = await this.organizationRepository.save(organization);

    const user = await this.usersService.createOAuthUser({
      organizationId: savedOrg.id,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl || null,
      oauthProvider: provider,
      oauthId: profile.oauthId,
      role: 'owner',
    });

    // Dual-write: create organization_members row for the new OAuth user
    await this.orgMemberRepository.save(
      this.orgMemberRepository.create({
        userId: user.id,
        organizationId: savedOrg.id,
        role: 'owner',
        isDefault: true,
      }),
    );

    return user;
  }

  // ── Two-Factor Authentication ────────────────────────────────────────────

  async setupTwoFactor(userId: string) {
    const user = await this.usersService.findById(userId);
    const secret = generateSecret();

    // Store secret temporarily (not enabled yet until confirmed)
    await this.usersService.update(userId, { twoFaSecret: secret } as any);

    const appName = this.configService.get<string>('app.name') || 'Boardupscale';
    const otpauthUrl = generateURI({ secret, issuer: appName, label: user.email });
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    return { secret, qrCodeUrl };
  }

  async confirmTwoFactor(userId: string, code: string) {
    const user = await this.usersService.findById(userId);
    if (!user.twoFaSecret) {
      throw new BadRequestException('2FA setup not initiated. Call setup first.');
    }

    const valid = await otpVerify({ token: code, secret: user.twoFaSecret });
    if (!valid) {
      throw new BadRequestException('Invalid verification code');
    }

    // Generate 10 backup codes
    const rawBackupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex'); // 8-char hex
      rawBackupCodes.push(code);
      hashedBackupCodes.push(await bcrypt.hash(code, 10));
    }

    await this.usersService.update(userId, {
      twoFaEnabled: true,
      backupCodes: hashedBackupCodes,
    } as any);

    return { backupCodes: rawBackupCodes };
  }

  async verifyTwoFactor(
    tempToken: string,
    code: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    let payload: any;
    try {
      payload = this.jwtService.verify(tempToken, {
        secret: this.configService.get<string>('jwt.secret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired 2FA token');
    }

    if (payload.purpose !== '2fa') {
      throw new UnauthorizedException('Invalid token purpose');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.twoFaEnabled) {
      throw new UnauthorizedException('2FA is not enabled for this user');
    }

    // Try TOTP first
    const totpValid = await otpVerify({ token: code, secret: user.twoFaSecret });
    if (!totpValid) {
      // Try backup codes
      const backupUsed = await this.verifyBackupCode(user, code);
      if (!backupUsed) {
        throw new UnauthorizedException('Invalid 2FA code');
      }
    }

    await this.usersService.updateLastLogin(user.id);
    const tokens = await this.generateTokens(user, ipAddress, userAgent);

    this.auditService.log(
      user.organizationId,
      user.id,
      'auth.login.2fa',
      'user',
      user.id,
      { email: user.email },
      ipAddress,
    );

    return { user, ...tokens };
  }

  async disableTwoFactor(userId: string, password: string) {
    const user = await this.usersService.findById(userId);
    if (!user.passwordHash) {
      throw new BadRequestException('Cannot verify password for OAuth-only account');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid password');
    }

    await this.usersService.update(userId, {
      twoFaEnabled: false,
      twoFaSecret: null,
      backupCodes: null,
    } as any);

    return { message: '2FA has been disabled' };
  }

  async regenerateBackupCodes(userId: string, password: string) {
    const user = await this.usersService.findById(userId);
    if (!user.twoFaEnabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid password');
    }

    const rawBackupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex');
      rawBackupCodes.push(code);
      hashedBackupCodes.push(await bcrypt.hash(code, 10));
    }

    await this.usersService.update(userId, {
      backupCodes: hashedBackupCodes,
    } as any);

    return { backupCodes: rawBackupCodes };
  }

  private async verifyBackupCode(user: any, code: string): Promise<boolean> {
    if (!user.backupCodes || user.backupCodes.length === 0) {
      return false;
    }

    for (let i = 0; i < user.backupCodes.length; i++) {
      const match = await bcrypt.compare(code, user.backupCodes[i]);
      if (match) {
        // Remove used backup code
        const updatedCodes = [...user.backupCodes];
        updatedCodes.splice(i, 1);
        await this.usersService.update(user.id, {
          backupCodes: updatedCodes,
        } as any);
        return true;
      }
    }
    return false;
  }

  // ── Invitation Accept ──────────────────────────────────────────────────

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

    // Prefer the per-invite target org. Fall back to the user's legacy
    // organization_id only if the pending-invite column is missing (old rows).
    const inviteOrgId = user.pendingInviteOrganizationId || user.organizationId;
    const org = inviteOrgId
      ? await this.organizationRepository.findOne({ where: { id: inviteOrgId } })
      : null;

    return {
      email: user.email,
      organizationName: org?.name || '',
    };
  }

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

    // The invite was for THIS org — not necessarily the user's legacy home org.
    const inviteOrgId = user.pendingInviteOrganizationId || user.organizationId;

    const passwordHash = await bcrypt.hash(password, 12);
    await this.usersService.activateInvitedUser(user.id, passwordHash, displayName);

    // Ensure organization_members row exists FOR THE INVITED ORG.
    const existingMembership = await this.orgMemberRepository.findOne({
      where: { userId: user.id, organizationId: inviteOrgId },
    });
    if (!existingMembership) {
      // Only mark as default if the user has no other memberships yet —
      // otherwise we'd silently change which workspace the user lands in on
      // login.
      const otherMembershipsCount = await this.orgMemberRepository.count({
        where: { userId: user.id },
      });
      await this.orgMemberRepository.save(
        this.orgMemberRepository.create({
          userId: user.id,
          organizationId: inviteOrgId,
          role: user.role || 'member',
          isDefault: otherMembershipsCount === 0,
        }),
      );
    }

    // Clear the pending-invite marker now that it's been accepted.
    await this.usersService.update(user.id, {
      pendingInviteOrganizationId: null,
    } as any);

    // Auto-repair project/org memberships for the invited org.
    // Idempotent — ensures Jira-migrated users see all their projects immediately after accepting.
    try {
      await this.organizationsService.repairOrgMemberships(inviteOrgId);
    } catch (repairErr: unknown) {
      // Non-fatal — log the warning but do not fail the invitation acceptance
      console.warn(
        `[acceptInvitation] repairOrgMemberships failed for org ${inviteOrgId}: ${(repairErr as Error)?.message}`,
      );
    }

    const activatedUser = await this.usersService.findById(user.id);
    const tokens = await this.generateTokens(activatedUser, ipAddress, userAgent);

    this.auditService.log(
      inviteOrgId,
      activatedUser.id,
      'auth.invitation_accepted',
      'user',
      activatedUser.id,
      { email: activatedUser.email },
      ipAddress,
    );

    return { user: activatedUser, ...tokens };
  }

  // ── SAML SSO ────────────────────────────────────────────────────────────

  async findOrCreateSamlUser(
    orgId: string,
    profile: { email: string; displayName?: string },
  ) {
    // First try to find by email within the organization
    const existingUser = await this.usersService.findByEmail(profile.email);

    if (existingUser) {
      await this.usersService.updateLastLogin(existingUser.id);
      // Ensure membership in the SAML org exists (user may already exist in a different org)
      const existingMembership = await this.orgMemberRepository.findOne({
        where: { userId: existingUser.id, organizationId: orgId },
      });
      if (!existingMembership) {
        await this.orgMemberRepository.save(
          this.orgMemberRepository.create({
            userId: existingUser.id,
            organizationId: orgId,
            role: 'member',
            isDefault: existingUser.organizationId === orgId,
          }),
        );
      }
      try {
        await this.organizationsService.repairOrgMemberships(orgId);
      } catch (err: unknown) {
        console.warn(`[findOrCreateSamlUser] repairOrgMemberships failed: ${(err as Error)?.message}`);
      }
      return existingUser;
    }

    // Create a new user in the organization (no password — SSO-only)
    const user = await this.usersService.createOAuthUser({
      organizationId: orgId,
      email: profile.email,
      displayName: profile.displayName || profile.email.split('@')[0],
      avatarUrl: null,
      oauthProvider: 'saml',
      oauthId: profile.email, // Use email as the SAML identifier
      role: 'member',
    });

    // Dual-write: create organization_members row for the new SAML user
    await this.orgMemberRepository.save(
      this.orgMemberRepository.create({
        userId: user.id,
        organizationId: orgId,
        role: 'member',
        isDefault: true,
      }),
    );

    try {
      await this.organizationsService.repairOrgMemberships(orgId);
    } catch (err: unknown) {
      console.warn(`[findOrCreateSamlUser] repairOrgMemberships failed: ${(err as Error)?.message}`);
    }

    return user;
  }

  // ── Switch Organization ───────────────────────────────────────────────────

  async switchOrganization(
    userId: string,
    targetOrgId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Verify the user has membership in the target org
    const membership = await this.orgMemberRepository.findOne({
      where: { userId, organizationId: targetOrgId },
    });
    if (!membership) {
      throw new UnauthorizedException('Not a member of this organization');
    }

    // Get the full user record
    const user = await this.usersService.findById(userId);

    // Get the organization details
    const organization = await this.organizationRepository.findOne({
      where: { id: targetOrgId },
    });

    const tokens = await this.generateTokens(user, ipAddress, userAgent, targetOrgId);

    this.auditService.log(
      targetOrgId,
      userId,
      'auth.switch_org',
      'organization',
      targetOrgId,
      { fromOrgId: user.organizationId, toOrgId: targetOrgId },
      ipAddress,
    );

    return {
      ...tokens,
      organization: organization
        ? { id: organization.id, name: organization.name, slug: organization.slug }
        : null,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      .substring(0, 50);
  }
}
