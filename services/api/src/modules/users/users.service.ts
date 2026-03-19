import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User not found`);
    }
    return user;
  }

  async findByIdAndOrg(id: string, organizationId: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id, organizationId },
    });
    if (!user) {
      throw new NotFoundException(`User not found`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findByOrg(organizationId: string): Promise<User[]> {
    return this.usersRepository.find({
      where: { organizationId, isActive: true },
      order: { displayName: 'ASC' },
    });
  }

  async create(data: {
    organizationId: string;
    email: string;
    displayName: string;
    passwordHash: string;
    role?: string;
  }): Promise<User> {
    const existing = await this.findByEmail(data.email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const user = this.usersRepository.create({
      organizationId: data.organizationId,
      email: data.email,
      displayName: data.displayName,
      passwordHash: data.passwordHash,
      role: data.role || 'owner',
      isActive: true,
      emailVerified: false,
    });

    return this.usersRepository.save(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<{ data: User }> {
    const user = await this.findById(id);
    Object.assign(user, dto);
    const saved = await this.usersRepository.save(user);
    return { data: saved };
  }

  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findById(id);
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await this.usersRepository.update(id, { passwordHash: hash });
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.usersRepository.update(id, { lastLoginAt: new Date() });
  }

  async findByOAuth(provider: string, oauthId: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { oauthProvider: provider, oauthId },
    });
  }

  async linkOAuthProvider(
    userId: string,
    provider: string,
    oauthId: string,
  ): Promise<void> {
    await this.usersRepository.update(userId, {
      oauthProvider: provider,
      oauthId,
      emailVerified: true,
    });
  }

  async createOAuthUser(data: {
    organizationId: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
    oauthProvider: string;
    oauthId: string;
    role?: string;
  }): Promise<User> {
    const user = this.usersRepository.create({
      organizationId: data.organizationId,
      email: data.email,
      displayName: data.displayName,
      avatarUrl: data.avatarUrl,
      oauthProvider: data.oauthProvider,
      oauthId: data.oauthId,
      role: data.role || 'owner',
      isActive: true,
      emailVerified: true,
    });

    return this.usersRepository.save(user);
  }

  async deactivate(id: string, organizationId: string): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { id, organizationId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.usersRepository.update(id, { isActive: false });
  }

  // ── Account Lockout helpers ───────────────────────────────────────────────

  async incrementFailedAttempts(id: string): Promise<number> {
    const user = await this.findById(id);
    const attempts = (user.failedLoginAttempts || 0) + 1;
    const updateData: Partial<User> = { failedLoginAttempts: attempts };

    // Lock for 15 minutes after 5 failed attempts
    if (attempts >= 5) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + 15);
      updateData.lockedUntil = lockedUntil;
    }

    await this.usersRepository.update(id, updateData);
    return attempts;
  }

  async resetFailedAttempts(id: string): Promise<void> {
    await this.usersRepository.update(id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  }

  isAccountLocked(user: User): boolean {
    if (!user.lockedUntil) return false;
    return new Date(user.lockedUntil) > new Date();
  }

  // ── Email Verification helpers ────────────────────────────────────────────

  async setEmailVerificationToken(
    id: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.usersRepository.update(id, {
      emailVerificationToken: tokenHash,
      emailVerificationExpiry: expiresAt,
    });
  }

  async findByEmailVerificationToken(tokenHash: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { emailVerificationToken: tokenHash },
    });
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.usersRepository.update(id, {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    });
  }

  // ── Password Reset helpers ────────────────────────────────────────────────

  async setPasswordResetToken(
    id: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.usersRepository.update(id, {
      passwordResetToken: tokenHash,
      passwordResetExpiry: expiresAt,
    });
  }

  async findByPasswordResetToken(tokenHash: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { passwordResetToken: tokenHash },
    });
  }

  async activateInvitedUser(
    id: string,
    passwordHash: string,
    displayName: string,
  ): Promise<void> {
    await this.usersRepository.update(id, {
      passwordHash,
      displayName,
      isActive: true,
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    });
  }

  async resetPassword(id: string, passwordHash: string): Promise<void> {
    await this.usersRepository.update(id, {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiry: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  }
}
