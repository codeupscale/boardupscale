import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  describe('handleRequest', () => {
    it('should return user when authentication succeeds', () => {
      const user = { id: 'user-id', email: 'test@example.com', role: 'member' };

      const result = guard.handleRequest(null, user, null);

      expect(result).toEqual(user);
    });

    it('should throw UnauthorizedException when user is not present', () => {
      expect(() => guard.handleRequest(null, null, null)).toThrow(UnauthorizedException);
      expect(() => guard.handleRequest(null, null, null)).toThrow('Invalid or expired token');
    });

    it('should throw the original error when err is provided', () => {
      const error = new UnauthorizedException('Token expired');

      expect(() => guard.handleRequest(error, null, null)).toThrow(UnauthorizedException);
    });

    it('should throw err even when user is present if err exists', () => {
      const error = new UnauthorizedException('Token tampered');
      const user = { id: 'user-id' };

      expect(() => guard.handleRequest(error, user, null)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with default message when no err and no user', () => {
      try {
        guard.handleRequest(null, false, null);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(UnauthorizedException);
        expect(e.message).toBe('Invalid or expired token');
      }
    });
  });
});
