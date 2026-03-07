import { BadRequestException } from '@nestjs/common';
import { PasswordPolicyService } from './password-policy.service';

describe('PasswordPolicyService', () => {
  let service: PasswordPolicyService;

  beforeEach(() => {
    service = new PasswordPolicyService();
  });

  describe('validate', () => {
    it('should accept a strong password', () => {
      expect(() => service.validate('SecureP@ss1')).not.toThrow();
    });

    it('should accept password with various special characters', () => {
      expect(() => service.validate('Test#1234')).not.toThrow();
      expect(() => service.validate('Hello!World9')).not.toThrow();
      expect(() => service.validate('Pa$$w0rd!')).not.toThrow();
    });

    it('should reject password shorter than 8 characters', () => {
      expect(() => service.validate('Aa1!xy')).toThrow(BadRequestException);
    });

    it('should reject password without uppercase', () => {
      expect(() => service.validate('lowercase@1')).toThrow(BadRequestException);
    });

    it('should reject password without lowercase', () => {
      expect(() => service.validate('UPPERCASE@1')).toThrow(BadRequestException);
    });

    it('should reject password without number', () => {
      expect(() => service.validate('NoNumbers@!')).toThrow(BadRequestException);
    });

    it('should reject password without special character', () => {
      expect(() => service.validate('NoSpecial1X')).toThrow(BadRequestException);
    });

    it('should report all violations at once', () => {
      try {
        service.validate('abc');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse() as any;
        expect(response.violations).toBeDefined();
        expect(response.violations.length).toBeGreaterThan(1);
      }
    });
  });

  describe('getViolations', () => {
    it('should return empty array for valid password', () => {
      const violations = service.getViolations('SecureP@ss1');
      expect(violations).toHaveLength(0);
    });

    it('should return multiple violations for empty string', () => {
      const violations = service.getViolations('');
      expect(violations.length).toBeGreaterThanOrEqual(4);
    });

    it('should identify specific violation rules', () => {
      const violations = service.getViolations('abcdefgh');
      const rules = violations.map((v) => v.rule);
      expect(rules).toContain('uppercase');
      expect(rules).toContain('number');
      expect(rules).toContain('special');
      expect(rules).not.toContain('lowercase');
      expect(rules).not.toContain('minLength');
    });
  });
});
