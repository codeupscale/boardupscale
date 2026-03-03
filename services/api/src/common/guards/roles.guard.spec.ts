import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard, ROLES_KEY } from './roles.guard';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let mockPermissionsService: any;

  beforeEach(() => {
    reflector = new Reflector();
    mockPermissionsService = {
      checkPermission: jest.fn().mockResolvedValue(true),
    };
    guard = new RolesGuard(reflector, mockPermissionsService);
  });

  function createMockExecutionContext(
    user: any,
    roles?: string[],
    permission?: { resource: string; action: string } | null,
    params?: any,
  ): ExecutionContext {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ user, params: params || {}, query: {}, body: {} }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    // Mock reflector to return permission first, then roles
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
      if (key === PERMISSION_KEY) return permission || undefined;
      if (key === ROLES_KEY) return roles;
      return undefined;
    });

    return mockContext;
  }

  describe('canActivate', () => {
    it('should allow access when no roles are required', async () => {
      const context = createMockExecutionContext({ id: 'user-id', role: 'member' }, undefined);
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should allow access when roles array is empty', async () => {
      const context = createMockExecutionContext({ id: 'user-id', role: 'member' }, []);
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should allow access when user has required role (admin)', async () => {
      const context = createMockExecutionContext({ id: 'user-id', role: 'admin' }, ['admin', 'owner']);
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should allow access when user has one of the required roles', async () => {
      const context = createMockExecutionContext({ id: 'user-id', role: 'owner' }, ['admin', 'owner']);
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user does not have required role', async () => {
      const context = createMockExecutionContext({ id: 'user-id', role: 'member' }, ['admin', 'owner']);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user is viewer accessing admin route', async () => {
      const context = createMockExecutionContext({ id: 'user-id', role: 'viewer' }, ['admin']);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when no user on request', async () => {
      const context = createMockExecutionContext(null, ['admin']);
      await expect(guard.canActivate(context)).rejects.toThrow('Access denied');
    });

    it('should check permission when @RequirePermission is set', async () => {
      const context = createMockExecutionContext(
        { id: 'user-id', role: 'member' },
        undefined,
        { resource: 'issue', action: 'create' },
        { projectId: 'project-123' },
      );
      mockPermissionsService.checkPermission.mockResolvedValue(true);
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(mockPermissionsService.checkPermission).toHaveBeenCalledWith(
        'user-id', 'project-123', 'issue', 'create',
      );
    });

    it('should throw when permission check fails', async () => {
      const context = createMockExecutionContext(
        { id: 'user-id', role: 'member' },
        undefined,
        { resource: 'issue', action: 'delete' },
        { projectId: 'project-123' },
      );
      mockPermissionsService.checkPermission.mockResolvedValue(false);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });
});
