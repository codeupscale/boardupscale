jest.mock('otplib', () => ({
  generateSecret: jest.fn().mockReturnValue('mock-secret'),
  generateURI: jest.fn().mockReturnValue('otpauth://mock'),
  verify: jest.fn().mockReturnValue(true),
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SamlService } from './saml.service';
import { UsersService } from '../users/users.service';
import { mockUser, TEST_IDS } from '../../test/mock-factories';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Record<string, jest.Mock>;
  let usersService: Record<string, jest.Mock>;

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      logout: jest.fn(),
      validateUser: jest.fn(),
      resendVerificationEmail: jest.fn(),
      verifyEmail: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
    };

    usersService = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: usersService },
        { provide: SamlService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('POST /auth/register', () => {
    it('should register a new user and return tokens', async () => {
      const dto = {
        email: 'new@example.com',
        password: 'SecureP@ss1',
        displayName: 'New User',
        organizationName: 'Test Org',
      };
      const expectedResult = {
        user: mockUser(),
        accessToken: 'token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      };
      authService.register.mockResolvedValue(expectedResult);

      const req = {
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' },
        headers: { 'user-agent': 'test-agent' },
      };

      const result = await controller.register(dto, req);

      expect(result).toEqual(expectedResult);
      expect(authService.register).toHaveBeenCalledWith(dto, '127.0.0.1', 'test-agent');
    });
  });

  describe('POST /auth/login', () => {
    it('should login and return tokens', async () => {
      const user = mockUser();
      const expectedResult = {
        user,
        accessToken: 'token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      };
      authService.login.mockResolvedValue(expectedResult);

      const req = {
        user,
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' },
        headers: { 'user-agent': 'test-agent' },
      };

      const result = await controller.login(req);

      expect(result).toEqual(expectedResult);
      expect(authService.login).toHaveBeenCalledWith(user, '127.0.0.1', 'test-agent');
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh tokens', async () => {
      const expectedResult = {
        accessToken: 'new-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 900,
      };
      authService.refreshToken.mockResolvedValue(expectedResult);

      const req = {
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' },
        headers: { 'user-agent': 'test-agent' },
      };

      const result = await controller.refresh({ refreshToken: 'old-refresh-token' }, req);

      expect(result).toEqual(expectedResult);
      expect(authService.refreshToken).toHaveBeenCalledWith('old-refresh-token', '127.0.0.1', 'test-agent', undefined);
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout with refresh token', async () => {
      authService.logout.mockResolvedValue(undefined);
      const user = { id: TEST_IDS.USER_ID };

      const result = await controller.logout(user, { refreshToken: 'some-token' });

      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(authService.logout).toHaveBeenCalledWith(TEST_IDS.USER_ID, 'some-token');
    });

    it('should logout without refresh token (revoke all)', async () => {
      authService.logout.mockResolvedValue(undefined);
      const user = { id: TEST_IDS.USER_ID };

      const result = await controller.logout(user, {});

      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(authService.logout).toHaveBeenCalledWith(TEST_IDS.USER_ID, undefined);
    });
  });

  describe('GET /auth/me', () => {
    it('should return the current user', async () => {
      const user = mockUser();
      usersService.findById.mockResolvedValue(user);

      // Simulate the JWT-derived user object (includes organizationId and role from token)
      const jwtUser = {
        id: TEST_IDS.USER_ID,
        organizationId: TEST_IDS.ORG_ID,
        role: 'member',
      };
      const result = await controller.me(jwtUser);

      expect(result).toEqual({
        data: {
          ...user,
          organizationId: TEST_IDS.ORG_ID,
          role: 'member',
        },
      });
      expect(usersService.findById).toHaveBeenCalledWith(TEST_IDS.USER_ID);
    });
  });

  // ── New endpoint tests ──────────────────────────────────────────────────

  describe('POST /auth/send-verification', () => {
    it('should resend verification email', async () => {
      authService.resendVerificationEmail.mockResolvedValue({ message: 'Verification email sent' });

      const result = await controller.sendVerification({ id: TEST_IDS.USER_ID });

      expect(result).toEqual({ message: 'Verification email sent' });
      expect(authService.resendVerificationEmail).toHaveBeenCalledWith(TEST_IDS.USER_ID);
    });
  });

  describe('GET /auth/verify-email', () => {
    it('should verify email with valid token', async () => {
      authService.verifyEmail.mockResolvedValue({ message: 'Email verified successfully' });

      const result = await controller.verifyEmail('some-token');

      expect(result).toEqual({ message: 'Email verified successfully' });
      expect(authService.verifyEmail).toHaveBeenCalledWith('some-token');
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should handle forgot password request', async () => {
      const expectedMessage = { message: 'If an account with that email exists, a password reset link has been sent.' };
      authService.forgotPassword.mockResolvedValue(expectedMessage);

      const result = await controller.forgotPassword({ email: 'test@example.com' });

      expect(result).toEqual(expectedMessage);
      expect(authService.forgotPassword).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should reset password with valid token and new password', async () => {
      authService.resetPassword.mockResolvedValue({ message: 'Password has been reset successfully' });

      const result = await controller.resetPassword({
        token: 'reset-token',
        newPassword: 'NewSecure@1',
      });

      expect(result).toEqual({ message: 'Password has been reset successfully' });
      expect(authService.resetPassword).toHaveBeenCalledWith('reset-token', 'NewSecure@1');
    });
  });
});
