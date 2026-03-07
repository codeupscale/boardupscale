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
import { UsersService } from '../users/users.service';
import { PasswordPolicyService } from './password-policy.service';
import { EmailService } from '../notifications/email.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    private usersService: UsersService,
    private emailService: EmailService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private passwordPolicyService: PasswordPolicyService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}

  // ── Validate User (with account lockout) ──────────────────────────────────

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
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

    return { user, ...tokens };
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(user: any, ipAddress?: string, userAgent?: string) {
    await this.usersService.updateLastLogin(user.id);
    const tokens = await this.generateTokens(user, ipAddress, userAgent);
    return { user, ...tokens };
  }

  // ── Token generation ──────────────────────────────────────────────────────

  async generateTokens(user: any, ipAddress?: string, userAgent?: string) {
    const payload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
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
    };
  }

  // ── Refresh token ─────────────────────────────────────────────────────────

  async refreshToken(token: string, ipAddress?: string, userAgent?: string) {
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

    const tokens = await this.generateTokens(stored.user, ipAddress, userAgent);
    return tokens;
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(userId: string, refreshToken?: string) {
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

    return user;
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
