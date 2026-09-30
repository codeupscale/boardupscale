import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { McpTokenGuard } from './mcp-token.guard';

describe('McpTokenGuard', () => {
  const key = {
    id: 'key-1',
    userId: 'user-1',
    orgId: 'org-1',
    scopes: ['mcp:read', 'mcp:comment'],
    user: { displayName: 'Ada', email: 'ada@example.com' },
  };
  let apiKeysService: { validate: jest.Mock };
  let orgMemberRepo: { findOne: jest.Mock };
  let guard: McpTokenGuard;

  const contextFor = (authorization?: string) => {
    const req: any = { headers: authorization ? { authorization } : {} };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { ctx, req };
  };

  beforeEach(() => {
    apiKeysService = { validate: jest.fn().mockResolvedValue(key) };
    orgMemberRepo = { findOne: jest.fn().mockResolvedValue({ role: 'user' }) };
    guard = new McpTokenGuard(apiKeysService as any, orgMemberRepo as any);
  });

  it('attaches the caller context for a valid token', async () => {
    const { ctx, req } = contextFor('Bearer bu_mcp_abc');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(orgMemberRepo.findOne).toHaveBeenCalledWith({
      where: { userId: 'user-1', organizationId: 'org-1' },
    });
    expect(req.mcpCtx).toEqual(
      expect.objectContaining({ userId: 'user-1', organizationId: 'org-1', orgRole: 'user', tokenId: 'key-1' }),
    );
  });

  it('rejects a missing header and non-MCP keys without hitting the DB', async () => {
    await expect(guard.canActivate(contextFor().ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(contextFor('Bearer pf_regular').ctx)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(apiKeysService.validate).not.toHaveBeenCalled();
  });

  it('propagates expired / revoked token errors', async () => {
    apiKeysService.validate.mockRejectedValue(new UnauthorizedException('API key has expired'));
    await expect(guard.canActivate(contextFor('Bearer bu_mcp_abc').ctx)).rejects.toThrow('expired');
  });

  it('rejects keys without the mcp:read scope', async () => {
    apiKeysService.validate.mockResolvedValue({ ...key, scopes: ['issues:read'] });
    await expect(guard.canActivate(contextFor('Bearer bu_mcp_abc').ctx)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects users who were removed from the organization', async () => {
    orgMemberRepo.findOne.mockResolvedValue(null);
    await expect(guard.canActivate(contextFor('Bearer bu_mcp_abc').ctx)).rejects.toThrow(
      'no longer a member',
    );
  });
});
