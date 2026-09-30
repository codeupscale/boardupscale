import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ApiKeysService, isMcpKey } from './api-keys.service';
import { ApiKeyStrategy } from './strategies/api-key.strategy';
import { createMockRepository } from '../../test/test-utils';

describe('ApiKeysService (MCP tokens)', () => {
  let repo: ReturnType<typeof createMockRepository>;
  let service: ApiKeysService;

  beforeEach(() => {
    repo = createMockRepository();
    repo.create.mockImplementation((v: any) => v);
    repo.save.mockImplementation(async (v: any) => ({ id: 'key-1', ...v }));
    service = new ApiKeysService(repo as any);
  });

  it('creates an expiring bu_mcp_ token with read + comment scopes and stores only its hash', async () => {
    const before = Date.now();
    const { apiKey, rawKey } = await service.createMcpToken('user-1', 'org-1', 'laptop', 30);

    expect(rawKey.startsWith('bu_mcp_')).toBe(true);
    expect(apiKey.keyHash).not.toContain(rawKey);
    expect(apiKey.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(apiKey.keyPrefix).toBe(rawKey.slice(0, 10));
    expect(apiKey.scopes).toEqual(['mcp:read', 'mcp:comment']);
    const days = (apiKey.expiresAt.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it('caps expiry at 365 days', async () => {
    const { apiKey } = await service.createMcpToken('user-1', 'org-1', 'x', 10_000);
    expect((apiKey.expiresAt.getTime() - Date.now()) / 86_400_000).toBeLessThanOrEqual(365);
  });

  it('lists only the caller’s active MCP tokens', async () => {
    repo.find.mockResolvedValue([
      { id: 'a', isActive: true, scopes: ['mcp:read'] },
      { id: 'b', isActive: false, scopes: ['mcp:read'] },
      { id: 'c', isActive: true, scopes: [] },
    ]);
    const tokens = await service.findMcpTokensByUser('user-1', 'org-1');
    expect(tokens.map((t) => t.id)).toEqual(['a']);
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1', orgId: 'org-1' } }));
  });

  it('revokes only the caller’s own MCP token', async () => {
    const key = { id: 'a', isActive: true, scopes: ['mcp:read'] };
    repo.findOne.mockResolvedValue(key);
    await service.revokeOwnMcpToken('a', 'user-1', 'org-1');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'a', userId: 'user-1', orgId: 'org-1' } });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
  });

  it('refuses to revoke someone else’s token or a non-MCP key', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.revokeOwnMcpToken('a', 'user-2', 'org-1')).rejects.toThrow(NotFoundException);
    repo.findOne.mockResolvedValue({ id: 'a', scopes: [] });
    await expect(service.revokeOwnMcpToken('a', 'user-1', 'org-1')).rejects.toThrow(NotFoundException);
  });

  it('isMcpKey detects mcp scopes', () => {
    expect(isMcpKey(['mcp:read'])).toBe(true);
    expect(isMcpKey(['issues:read'])).toBe(false);
    expect(isMcpKey(null)).toBe(false);
  });
});

describe('ApiKeyStrategy', () => {
  const user = { id: 'user-1', email: 'a@b.c', role: 'user', displayName: 'Ada' };

  it('rejects MCP tokens on the REST API', async () => {
    const strategy = new ApiKeyStrategy({
      validate: jest.fn().mockResolvedValue({ id: 'k', orgId: 'org-1', scopes: ['mcp:read'], user }),
    } as any);
    await expect(strategy.validate({ headers: { 'x-api-key': 'bu_mcp_x' } } as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('still accepts regular API keys', async () => {
    const strategy = new ApiKeyStrategy({
      validate: jest.fn().mockResolvedValue({ id: 'k', orgId: 'org-1', scopes: [], user }),
    } as any);
    await expect(strategy.validate({ headers: { 'x-api-key': 'pf_x' } } as any)).resolves.toEqual(
      expect.objectContaining({ id: 'user-1', organizationId: 'org-1', apiKeyId: 'k' }),
    );
  });
});
