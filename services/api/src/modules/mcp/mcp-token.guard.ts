import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeysService, MCP_SCOPE_READ, MCP_TOKEN_PREFIX } from '../api-keys/api-keys.service';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';
import { McpRequest } from './mcp.types';

/**
 * Authenticates `Authorization: Bearer bu_mcp_…` tokens for the MCP endpoint.
 * Org membership is re-checked on every request so removing a user from the
 * organization revokes MCP access immediately.
 */
@Injectable()
export class McpTokenGuard implements CanActivate {
  constructor(
    private apiKeysService: ApiKeysService,
    @InjectRepository(OrganizationMember)
    private orgMemberRepo: Repository<OrganizationMember>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<McpRequest>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    if (!token.startsWith(MCP_TOKEN_PREFIX)) {
      throw new UnauthorizedException('A Boardupscale MCP token is required');
    }

    const key = await this.apiKeysService.validate(token);
    if (!key.scopes?.includes(MCP_SCOPE_READ)) {
      throw new UnauthorizedException('Token is not valid for MCP');
    }

    const membership = await this.orgMemberRepo.findOne({
      where: { userId: key.userId, organizationId: key.orgId },
    });
    if (!membership) {
      throw new UnauthorizedException('User is no longer a member of this organization');
    }

    req.mcpCtx = {
      userId: key.userId,
      organizationId: key.orgId,
      orgRole: membership.role,
      scopes: key.scopes,
      tokenId: key.id,
      displayName: key.user.displayName,
      email: key.user.email,
    };
    return true;
  }
}
