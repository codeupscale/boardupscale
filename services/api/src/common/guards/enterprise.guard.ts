import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * EnterpriseGuard
 *
 * Gates routes behind the ENTERPRISE_ENABLED flag.
 * Self-hosters with a commercial Boardupscale Enterprise licence set
 * ENTERPRISE_ENABLED=true in their environment.
 *
 * Community Edition users receive a clear 403 explaining what to do.
 */
@Injectable()
export class EnterpriseGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const enterpriseEnabled = this.configService.get<boolean>('enterprise.enabled');

    if (!enterpriseEnabled) {
      throw new ForbiddenException(
        'This feature requires a Boardupscale Enterprise licence. ' +
          'Set ENTERPRISE_ENABLED=true after obtaining a licence at ' +
          'https://boardupscale.com/enterprise',
      );
    }

    return true;
  }
}
