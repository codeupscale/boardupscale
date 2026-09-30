import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyStrategy } from './api-key.strategy';
import { TEST_IDS } from '../../../test/mock-factories';

describe('ApiKeyStrategy', () => {
  const keyRecord = {
    id: 'key-1',
    orgId: TEST_IDS.ORG_ID,
    scopes: ['read'],
    user: {
      id: TEST_IDS.USER_ID,
      email: 'dev@example.com',
      displayName: 'Dev',
      organizationId: '00000000-0000-4000-8000-0000000000bb',
      role: 'owner', // role in the user's *default* org — must not leak into the key's org
    },
  };
  let apiKeysService: { validate: jest.Mock; resolveOrgRole: jest.Mock };
  let strategy: ApiKeyStrategy;

  beforeEach(() => {
    apiKeysService = {
      validate: jest.fn().mockResolvedValue(keyRecord),
      resolveOrgRole: jest.fn().mockResolvedValue('user'),
    };
    strategy = new ApiKeyStrategy(apiKeysService as any);
  });

  it("returns the key org's membership role instead of users.role", async () => {
    const user = await strategy.validate({ headers: { 'x-api-key': 'pf_abc' } } as any);

    expect(apiKeysService.resolveOrgRole).toHaveBeenCalledWith(keyRecord);
    expect(user).toEqual({
      id: TEST_IDS.USER_ID,
      email: 'dev@example.com',
      organizationId: TEST_IDS.ORG_ID,
      role: 'user',
      displayName: 'Dev',
      apiKeyId: 'key-1',
      apiKeyScopes: ['read'],
    });
  });

  it('rejects requests without an API key', async () => {
    await expect(strategy.validate({ headers: {} } as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(apiKeysService.validate).not.toHaveBeenCalled();
  });

  it('propagates rejection when the key owner left the org', async () => {
    apiKeysService.resolveOrgRole.mockRejectedValue(new UnauthorizedException());

    await expect(
      strategy.validate({ headers: { 'x-api-key': 'pf_abc' } } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
