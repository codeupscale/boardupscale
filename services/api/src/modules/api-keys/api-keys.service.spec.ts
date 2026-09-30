import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKey } from './entities/api-key.entity';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';
import { createMockRepository } from '../../test/test-utils';
import { TEST_IDS } from '../../test/mock-factories';

const OTHER_ORG_ID = '00000000-0000-4000-8000-0000000000bb';

describe('ApiKeysService.resolveOrgRole', () => {
  let service: ApiKeysService;
  let orgMemberRepo: ReturnType<typeof createMockRepository>;

  const keyFor = (user: { organizationId: string; role: string }) =>
    ({
      id: 'key-1',
      orgId: TEST_IDS.ORG_ID,
      user: { id: TEST_IDS.USER_ID, ...user },
    }) as unknown as ApiKey;

  beforeEach(async () => {
    orgMemberRepo = createMockRepository();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: getRepositoryToken(ApiKey), useValue: createMockRepository() },
        { provide: getRepositoryToken(OrganizationMember), useValue: orgMemberRepo },
      ],
    }).compile();
    service = module.get(ApiKeysService);
  });

  it("uses the organization_members role for the key's org, not users.role", async () => {
    // Owner of their default org, but only a plain user in the key's org.
    orgMemberRepo.findOne.mockResolvedValue({ id: 'm1', role: 'user' });

    await expect(
      service.resolveOrgRole(keyFor({ organizationId: OTHER_ORG_ID, role: 'owner' })),
    ).resolves.toBe('user');
    expect(orgMemberRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: TEST_IDS.USER_ID, organizationId: TEST_IDS.ORG_ID },
      }),
    );
  });

  it('keeps administrator access for an org administrator key', async () => {
    orgMemberRepo.findOne.mockResolvedValue({ id: 'm1', role: 'administrator' });

    await expect(
      service.resolveOrgRole(keyFor({ organizationId: TEST_IDS.ORG_ID, role: 'user' })),
    ).resolves.toBe('administrator');
  });

  it("falls back to users.role only for legacy rows in the user's own default org", async () => {
    orgMemberRepo.findOne.mockResolvedValue(null);

    await expect(
      service.resolveOrgRole(keyFor({ organizationId: TEST_IDS.ORG_ID, role: 'owner' })),
    ).resolves.toBe('owner');
  });

  it('rejects a key whose owner is no longer a member of the key org', async () => {
    orgMemberRepo.findOne.mockResolvedValue(null);

    await expect(
      service.resolveOrgRole(keyFor({ organizationId: OTHER_ORG_ID, role: 'owner' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
