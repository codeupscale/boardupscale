import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../users/users.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { RegisterDto } from './dto/register.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return null;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return null;
    }
    if (!user.isActive) {
      return null;
    }
    return user;
  }

  async register(dto: RegisterDto, ipAddress?: string, userAgent?: string) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const slug = this.generateSlug(dto.organizationName);
    const existingSlug = await this.organizationRepository.findOne({ where: { slug } });
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

    const tokens = await this.generateTokens(user, ipAddress, userAgent);

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

    return { user, ...tokens };
  }

  async login(user: any, ipAddress?: string, userAgent?: string) {
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

    await this.refreshTokenRepository.update(stored.id, { revokedAt: new Date() });

    const tokens = await this.generateTokens(stored.user, ipAddress, userAgent);
    return tokens;
  }

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
