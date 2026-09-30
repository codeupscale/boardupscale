import { ForbiddenException } from '@nestjs/common';
import { McpTokensController } from './mcp-tokens.controller';

describe('McpTokensController', () => {
  const user = { id: 'user-1' };
  let apiKeysService: Record<string, jest.Mock>;
  let controller: McpTokensController;

  beforeEach(() => {
    apiKeysService = {
      findMcpTokensByUser: jest.fn().mockResolvedValue([
        { id: 't', name: 'n', keyPrefix: 'bu_mcp_ab', keyHash: 'secret-hash', scopes: [] },
      ]),
      createMcpToken: jest.fn().mockResolvedValue({ apiKey: { id: 't', name: 'n' }, rawKey: 'bu_mcp_raw' }),
      revokeOwnMcpToken: jest.fn().mockResolvedValue(undefined),
    };
    controller = new McpTokensController(apiKeysService as any);
  });

  it('never returns key hashes when listing', async () => {
    const { data } = await controller.findAll(user, 'org-1');
    expect(data[0]).not.toHaveProperty('keyHash');
    expect(apiKeysService.findMcpTokensByUser).toHaveBeenCalledWith('user-1', 'org-1');
  });

  it('creates with a 90-day default and returns the raw token once', async () => {
    const { data } = await controller.create({ name: 'n' }, user, 'org-1');
    expect(apiKeysService.createMcpToken).toHaveBeenCalledWith('user-1', 'org-1', 'n', 90);
    expect(data.token).toBe('bu_mcp_raw');
  });

  it('revokes scoped to the caller', async () => {
    await controller.revoke('t', user, 'org-1');
    expect(apiKeysService.revokeOwnMcpToken).toHaveBeenCalledWith('t', 'user-1', 'org-1');
  });

  it('refuses token management when authenticated with an API key', async () => {
    const keyUser = { id: 'user-1', apiKeyId: 'k' };
    await expect(controller.findAll(keyUser, 'org-1')).rejects.toThrow(ForbiddenException);
    await expect(controller.create({ name: 'n' }, keyUser, 'org-1')).rejects.toThrow(ForbiddenException);
    expect(apiKeysService.createMcpToken).not.toHaveBeenCalled();
  });
});
