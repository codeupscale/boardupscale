import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PasswordPolicyService } from './password-policy.service';
import { UsersService } from '../users/users.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { createMockRepository, createMockConfigService, mockUpdateResult } from '../../test/test-utils';
import { mockUser, mockOrganization, mockRefreshToken, TEST_IDS } from '../../test/mock-factories';

jest.mock('bcryptjs');
jest.mock('uuid', () => ({ v4: () => 'mock-uuid-value' }));

describe('AuthService', () => {
  let service: AuthService;
  let refreshTokenRepo: ReturnType<typeof createMockRepository>;
  let organizationRepo: ReturnType<typeof createMockRepository>;
  let usersService: Record<string, jest.Mock>;
  let jwtService: Record<string, jest.Mock>;
  let emailQueue: Record<string, jest.Mock>;
  let passwordPolicyService: PasswordPolicyService;

  beforeEach(async () => {
    refreshTokenRepo = createMockRepository();
    organizationRepo = createMockRepository();

    usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      updateLastLogin: jest.fn(),
      findById: jest.fn(),
      incrementFailedAttempts: jest.fn(),
      resetFailedAttempts: jest.fn(),
      isAccountLocked: jest.fn().mockReturnValue(false),
      setEmailVerificationToken: jest.fn(),
      findByEmailVerificationToken: jest.fn(),
      markEmailVerified: jest.fn(),
      setPasswordResetToken: jest.fn(),
      findByPasswordResetToken: jest.fn(),
      resetPassword: jest.fn(),
      changePassword: jest.fn(),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mock-access-token'),
      verify: jest.fn(),
    };

    emailQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        PasswordPolicyService,
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokenRepo },
        { provide: getRepositoryToken(Organization), useValue: organizationRepo },
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: createMockConfigService({ 'app.frontendUrl': 'http://localhost:3000' }) },
        { provide: getQueueToken('email'), useValue: emailQueue },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    passwordPolicyService = module.get<PasswordPolicyService>(PasswordPolicyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('should return user when credentials are valid', async () => {
      const user = mockUser({ failedLoginAttempts: 0 });
      usersService.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toEqual(user);
      expect(usersService.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(bcrypt.compare).toHaveBeenCalledWith('password', user.passwordHash);
    });

    it('should return null when user is not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.validateUser('notfound@example.com', 'password');

      expect(result).toBeNull();
    });

    it('should increment failed attempts and return null when password is wrong', async () => {
      const user = mockUser({ failedLoginAttempts: 0 });
      usersService.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      usersService.incrementFailedAttempts.mockResolvedValue(1);

      const result = await service.validateUser('test@example.com', 'wrongpassword');

      expect(result).toBeNull();
      expect(usersService.incrementFailedAttempts).toHaveBeenCalledWith(user.id);
    });

    it('should throw 423 Locked when account is locked', async () => {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      const user = mockUser({ lockedUntil, failedLoginAttempts: 5 });
      usersService.findByEmail.mockResolvedValue(user);
      usersService.isAccountLocked.mockReturnValue(true);

      await expect(service.validateUser('test@example.com', 'password')).rejects.toThrow(HttpException);
      try {
        await service.validateUser('test@example.com', 'password');
      } catch (err) {
        expect((err as HttpException).getStatus()).toBe(423);
      }
    });

    it('should throw 423 Locked after 5th failed attempt', async () => {
      const user = mockUser({ failedLoginAttempts: 4 });
      usersService.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      usersService.incrementFailedAttempts.mockResolvedValue(5);

      await expect(service.validateUser('test@example.com', 'wrong')).rejects.toThrow(HttpException);
    });

    it('should reset failed attempts on successful login', async () => {
      const user = mockUser({ failedLoginAttempts: 3 });
      usersService.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.validateUser('test@example.com', 'password');

      expect(usersService.resetFailedAttempts).toHaveBeenCalledWith(user.id);
    });

    it('should return null when user is inactive', async () => {
      const user = mockUser({ isActive: false, failedLoginAttempts: 0 });
      usersService.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toBeNull();
    });
  });

  describe('register', () => {
    const registerDto = {
      email: 'new@example.com',
      password: 'SecureP@ss1',
      displayName: 'New User',
      organizationName: 'New Org',
    };

    it('should create user and organization, send verification email, and return tokens', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      organizationRepo.findOne.mockResolvedValue(null);
      const savedOrg = mockOrganization({ id: 'new-org-id', name: 'New Org', slug: 'new-org' });
      organizationRepo.create.mockReturnValue(savedOrg);
      organizationRepo.save.mockResolvedValue(savedOrg);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      const createdUser = mockUser({ id: 'new-user-id', organizationId: 'new-org-id', role: 'owner' });
      usersService.create.mockResolvedValue(createdUser);
      usersService.setEmailVerificationToken.mockResolvedValue(undefined);
      refreshTokenRepo.create.mockReturnValue({});
      refreshTokenRepo.save.mockResolvedValue({});

      const result = await service.register(registerDto, '127.0.0.1', 'test-agent');

      expect(result.user).toEqual(createdUser);
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-uuid-value');
      expect(result.expiresIn).toBe(900);
      // Verify email was enqueued
      expect(emailQueue.add).toHaveBeenCalledWith('email-verification', expect.objectContaining({
        to: createdUser.email,
      }));
    });

    it('should throw ConflictException when email already exists', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser());

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for weak password', async () => {
      await expect(
        service.register({ ...registerDto, password: 'weak' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should append timestamp to slug when slug already exists', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      organizationRepo.findOne.mockResolvedValue(mockOrganization()); // slug exists
      const savedOrg = mockOrganization();
      organizationRepo.create.mockReturnValue(savedOrg);
      organizationRepo.save.mockResolvedValue(savedOrg);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      usersService.create.mockResolvedValue(mockUser());
      usersService.setEmailVerificationToken.mockResolvedValue(undefined);
      refreshTokenRepo.create.mockReturnValue({});
      refreshTokenRepo.save.mockResolvedValue({});

      await service.register(registerDto);

      const createCall = organizationRepo.create.mock.calls[0][0] as any;
      expect(createCall.slug).toMatch(/^new-org-\d+$/);
    });
  });

  describe('login', () => {
    it('should update lastLogin and return tokens', async () => {
      const user = mockUser();
      usersService.updateLastLogin.mockResolvedValue(undefined);
      refreshTokenRepo.create.mockReturnValue({});
      refreshTokenRepo.save.mockResolvedValue({});

      const result = await service.login(user, '127.0.0.1', 'test-agent');

      expect(usersService.updateLastLogin).toHaveBeenCalledWith(user.id);
      expect(result.user).toEqual(user);
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-uuid-value');
      expect(result.expiresIn).toBe(900);
    });
  });

  describe('generateTokens', () => {
    it('should create JWT access token and persist refresh token', async () => {
      const user = mockUser();
      refreshTokenRepo.create.mockReturnValue({});
      refreshTokenRepo.save.mockResolvedValue({});

      const result = await service.generateTokens(user, '127.0.0.1', 'test-agent');

      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: user.id,
          email: user.email,
          organizationId: user.organizationId,
          role: user.role,
        },
        {
          secret: 'test-jwt-secret',
          expiresIn: '15m',
        },
      );
      expect(refreshTokenRepo.create).toHaveBeenCalled();
      expect(refreshTokenRepo.save).toHaveBeenCalled();
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-uuid-value');
      expect(result.expiresIn).toBe(900);
    });
  });

  describe('refreshToken', () => {
    it('should revoke old token and return new tokens', async () => {
      const user = mockUser();
      const storedToken = mockRefreshToken({
        user,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      refreshTokenRepo.findOne.mockResolvedValue(storedToken);
      refreshTokenRepo.update.mockResolvedValue(mockUpdateResult());
      refreshTokenRepo.create.mockReturnValue({});
      refreshTokenRepo.save.mockResolvedValue({});

      const result = await service.refreshToken('some-refresh-token', '127.0.0.1', 'test-agent');

      expect(refreshTokenRepo.update).toHaveBeenCalledWith(storedToken.id, { revokedAt: expect.any(Date) });
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-uuid-value');
    });

    it('should throw UnauthorizedException when token not found', async () => {
      refreshTokenRepo.findOne.mockResolvedValue(null);

      await expect(service.refreshToken('invalid-token')).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshToken('invalid-token')).rejects.toThrow('Invalid or expired refresh token');
    });

    it('should throw UnauthorizedException when token is revoked', async () => {
      const storedToken = mockRefreshToken({
        revokedAt: new Date(),
        user: mockUser(),
      });
      refreshTokenRepo.findOne.mockResolvedValue(storedToken);

      await expect(service.refreshToken('revoked-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      const storedToken = mockRefreshToken({
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        user: mockUser(),
      });
      refreshTokenRepo.findOne.mockResolvedValue(storedToken);

      await expect(service.refreshToken('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user is inactive', async () => {
      const storedToken = mockRefreshToken({
        revokedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        user: mockUser({ isActive: false }),
      });
      refreshTokenRepo.findOne.mockResolvedValue(storedToken);

      await expect(service.refreshToken('some-token')).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshToken('some-token')).rejects.toThrow('User account is inactive');
    });
  });

  describe('logout', () => {
    it('should revoke specific refresh token when provided', async () => {
      refreshTokenRepo.update.mockResolvedValue(mockUpdateResult());

      await service.logout(TEST_IDS.USER_ID, 'some-refresh-token');

      expect(refreshTokenRepo.update).toHaveBeenCalledWith(
        { userId: TEST_IDS.USER_ID, tokenHash: expect.any(String) },
        { revokedAt: expect.any(Date) },
      );
    });

    it('should revoke all tokens when no refresh token provided', async () => {
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 3 }),
      };
      refreshTokenRepo.createQueryBuilder.mockReturnValue(qb as any);

      await service.logout(TEST_IDS.USER_ID);

      expect(refreshTokenRepo.createQueryBuilder).toHaveBeenCalled();
      expect(qb.where).toHaveBeenCalledWith('user_id = :userId AND revoked_at IS NULL', { userId: TEST_IDS.USER_ID });
    });
  });

  describe('verifyEmail', () => {
    it('should verify email with valid token', async () => {
      const user = mockUser({
        emailVerificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      usersService.findByEmailVerificationToken.mockResolvedValue(user);
      usersService.markEmailVerified.mockResolvedValue(undefined);

      const result = await service.verifyEmail('raw-token');

      expect(result.message).toBe('Email verified successfully');
      expect(usersService.markEmailVerified).toHaveBeenCalledWith(user.id);
    });

    it('should throw BadRequestException for invalid token', async () => {
      usersService.findByEmailVerificationToken.mockResolvedValue(null);

      await expect(service.verifyEmail('bad-token')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for expired token', async () => {
      const user = mockUser({
        emailVerificationExpiry: new Date(Date.now() - 1000),
      });
      usersService.findByEmailVerificationToken.mockResolvedValue(user);

      await expect(service.verifyEmail('expired-token')).rejects.toThrow(BadRequestException);
    });
  });

  describe('forgotPassword', () => {
    it('should send reset email for existing user', async () => {
      const user = mockUser();
      usersService.findByEmail.mockResolvedValue(user);
      usersService.setPasswordResetToken.mockResolvedValue(undefined);

      const result = await service.forgotPassword('test@example.com');

      expect(result.message).toContain('password reset link has been sent');
      expect(emailQueue.add).toHaveBeenCalledWith('password-reset', expect.objectContaining({
        to: user.email,
      }));
    });

    it('should return same message for non-existing user (no email enumeration)', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword('nonexistent@example.com');

      expect(result.message).toContain('password reset link has been sent');
      expect(emailQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should reset password with valid token and strong password', async () => {
      const user = mockUser({
        passwordResetExpiry: new Date(Date.now() + 60 * 60 * 1000),
      });
      usersService.findByPasswordResetToken.mockResolvedValue(user);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
      usersService.resetPassword.mockResolvedValue(undefined);

      const result = await service.resetPassword('raw-token', 'NewSecure@1');

      expect(result.message).toBe('Password has been reset successfully');
      expect(usersService.resetPassword).toHaveBeenCalledWith(user.id, 'new-hashed-password');
    });

    it('should throw BadRequestException for invalid token', async () => {
      usersService.findByPasswordResetToken.mockResolvedValue(null);

      await expect(service.resetPassword('bad-token', 'NewSecure@1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for expired token', async () => {
      const user = mockUser({
        passwordResetExpiry: new Date(Date.now() - 1000),
      });
      usersService.findByPasswordResetToken.mockResolvedValue(user);

      await expect(service.resetPassword('expired-token', 'NewSecure@1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for weak password', async () => {
      await expect(service.resetPassword('raw-token', 'weak')).rejects.toThrow(BadRequestException);
    });
  });

  describe('hashToken', () => {
    it('should return SHA-256 hex digest of input', () => {
      const hash1 = service.hashToken('test-token');
      const hash2 = service.hashToken('test-token');
      const hash3 = service.hashToken('different-token');

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
    });
  });
});
