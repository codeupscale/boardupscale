import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard, ROLES_KEY } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function createMockExecutionContext(user: any, roles?: string[]): ExecutionContext {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);

    return mockContext;
  }

  describe('canActivate', () => {
    it('should allow access when no roles are required', () => {
      const context = createMockExecutionContext({ id: 'user-id', role: 'member' }, undefined);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when roles array is empty', () => {
      const context = createMockExecutionContext({ id: 'user-id', role: 'member' }, []);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when user has required role (admin)', () => {
      const context = createMockExecutionContext({ id: 'user-id', role: 'admin' }, ['admin', 'owner']);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when user has one of the required roles', () => {
      const context = createMockExecutionContext({ id: 'user-id', role: 'owner' }, ['admin', 'owner']);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw ForbiddenException when user does not have required role', () => {
      const context = createMockExecutionContext({ id: 'user-id', role: 'member' }, ['admin', 'owner']);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
    });

    it('should throw ForbiddenException when user is viewer accessing admin route', () => {
      const context = createMockExecutionContext({ id: 'user-id', role: 'viewer' }, ['admin']);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when no user on request', () => {
      const context = createMockExecutionContext(null, ['admin']);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Access denied');
    });

    it('should throw ForbiddenException when user is undefined', () => {
      const context = createMockExecutionContext(undefined, ['admin']);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
