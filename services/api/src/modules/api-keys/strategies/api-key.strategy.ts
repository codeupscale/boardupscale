import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { ApiKeysService } from '../api-keys.service';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private apiKeysService: ApiKeysService) {
    super();
  }

  async validate(req: Request): Promise<any> {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    const keyRecord = await this.apiKeysService.validate(apiKey);

    // Return user-like object consistent with JWT strategy output
    return {
      id: keyRecord.user.id,
      email: keyRecord.user.email,
      organizationId: keyRecord.orgId,
      role: keyRecord.user.role,
      displayName: keyRecord.user.displayName,
      apiKeyId: keyRecord.id,
      apiKeyScopes: keyRecord.scopes,
    };
  }
}
