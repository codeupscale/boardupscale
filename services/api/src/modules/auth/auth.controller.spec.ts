import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
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
    };

    usersService = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('POST /auth/register', () => {
    it('should register a new user and return tokens', async () => {
      const dto = {
        email: 'new@example.com',
        password: 'securePassword123',
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
      expect(authService.refreshToken).toHaveBeenCalledWith('old-refresh-token', '127.0.0.1', 'test-agent');
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

      const result = await controller.me({ id: TEST_IDS.USER_ID });

      expect(result).toEqual({ data: user });
      expect(usersService.findById).toHaveBeenCalledWith(TEST_IDS.USER_ID);
    });
  });
});
