import { Injectable, BadRequestException } from '@nestjs/common';

export interface PasswordPolicyViolation {
  rule: string;
  message: string;
}

@Injectable()
export class PasswordPolicyService {
  private readonly MIN_LENGTH = 8;

  validate(password: string): void {
    const violations = this.getViolations(password);
    if (violations.length > 0) {
      const messages = violations.map((v) => v.message);
      throw new BadRequestException({
        message: 'Password does not meet security requirements',
        violations: messages,
      });
    }
  }

  getViolations(password: string): PasswordPolicyViolation[] {
    const violations: PasswordPolicyViolation[] = [];

    if (!password || password.length < this.MIN_LENGTH) {
      violations.push({
        rule: 'minLength',
        message: `Password must be at least ${this.MIN_LENGTH} characters long`,
      });
    }

    if (!/[A-Z]/.test(password)) {
      violations.push({
        rule: 'uppercase',
        message: 'Password must contain at least 1 uppercase letter',
      });
    }

    if (!/[a-z]/.test(password)) {
      violations.push({
        rule: 'lowercase',
        message: 'Password must contain at least 1 lowercase letter',
      });
    }

    if (!/[0-9]/.test(password)) {
      violations.push({
        rule: 'number',
        message: 'Password must contain at least 1 number',
      });
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
      violations.push({
        rule: 'special',
        message: 'Password must contain at least 1 special character',
      });
    }

    return violations;
  }
}
