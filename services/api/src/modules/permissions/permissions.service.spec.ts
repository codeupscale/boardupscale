import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';
import { User } from '../users/entities/user.entity';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';
import { createMockRepository, createMockQueryBuilder } from '../../test/test-utils';
import { mockProjectMember, TEST_IDS } from '../../test/mock-factories';

const OTHER_ORG_ID = '00000000-0000-4000-8000-0000000000bb';

describe('PermissionsService.checkPermission — project visibility', () => {
  let service: PermissionsService;
  let roleRepo: ReturnType<typeof createMockRepository>;
  let projectMemberRepo: ReturnType<typeof createMockRepository>;
  let userRepo: ReturnType<typeof createMockRepository>;
  let orgMemberRepo: ReturnType<typeof createMockRepository>;
  /** Query builder used by resolveProject (projects table lookup). */
  let projectQb: ReturnType<typeof createMockQueryBuilder>;
  /** Query builder used by resolveProjectFromResource / alias lookup. */
  let rawQb: ReturnType<typeof createMockQueryBuilder>;

  const project = (organizationId = TEST_IDS.ORG_ID) => ({
    id: TEST_IDS.PROJECT_ID,
    organizationId,
  });

  beforeEach(async () => {
    roleRepo = createMockRepository();
    projectMemberRepo = createMockRepository();
    userRepo = createMockRepository();
    orgMemberRepo = createMockRepository();

    projectQb = createMockQueryBuilder();
    rawQb = createMockQueryBuilder();
    (rawQb as any).from = jest.fn().mockReturnThis();
    (projectMemberRepo as any).manager = {
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(projectQb),
      }),
      createQueryBuilder: jest.fn().mockReturnValue(rawQb),
    };

    // Plain org user in the caller's org by default.
    orgMemberRepo.findOne.mockResolvedValue({ role: 'user' });
    userRepo.findOne.mockResolvedValue({
      id: TEST_IDS.USER_ID,
      organizationId: TEST_IDS.ORG_ID,
      role: 'user',
    });
    roleRepo.findOne.mockResolvedValue({
      permissions: [{ resource: 'issue', action: 'read' }],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: getRepositoryToken(Permission), useValue: createMockRepository() },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(ProjectMember), useValue: projectMemberRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(OrganizationMember), useValue: orgMemberRepo },
      ],
    }).compile();

    service = module.get(PermissionsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('denies issue:read to a plain org user who is not a project member', async () => {
    projectQb.getRawOne.mockResolvedValue(project());
    projectMemberRepo.findOne.mockResolvedValue(null);

    await expect(
      service.checkPermission(TEST_IDS.USER_ID, TEST_IDS.PROJECT_ID, 'issue', 'read', TEST_IDS.ORG_ID),
    ).resolves.toBe(false);
  });

  it('grants issue:read to a project member whose role includes it', async () => {
    projectQb.getRawOne.mockResolvedValue(project());
    projectMemberRepo.findOne.mockResolvedValue(mockProjectMember({ role: 'member' }));

    await expect(
      service.checkPermission(TEST_IDS.USER_ID, TEST_IDS.PROJECT_ID, 'issue', 'read', TEST_IDS.ORG_ID),
    ).resolves.toBe(true);
  });

  it('denies a project member whose custom role lacks issue:read', async () => {
    projectQb.getRawOne.mockResolvedValue(project());
    projectMemberRepo.findOne.mockResolvedValue(
      mockProjectMember({
        assignedRole: { permissions: [{ resource: 'board', action: 'read' }] } as any,
      }),
    );

    await expect(
      service.checkPermission(TEST_IDS.USER_ID, TEST_IDS.PROJECT_ID, 'issue', 'read', TEST_IDS.ORG_ID),
    ).resolves.toBe(false);
  });

  it('grants issue:read to an org administrator without project membership', async () => {
    projectQb.getRawOne.mockResolvedValue(project());
    orgMemberRepo.findOne.mockResolvedValue({ role: 'administrator' });

    await expect(
      service.checkPermission(TEST_IDS.USER_ID, TEST_IDS.PROJECT_ID, 'issue', 'read', TEST_IDS.ORG_ID),
    ).resolves.toBe(true);
    expect(projectMemberRepo.findOne).not.toHaveBeenCalled();
  });

  it('grants issue:read to an org owner without project membership', async () => {
    projectQb.getRawOne.mockResolvedValue(project());
    orgMemberRepo.findOne.mockResolvedValue({ role: 'owner' });

    await expect(
      service.checkPermission(TEST_IDS.USER_ID, TEST_IDS.PROJECT_ID, 'issue', 'read', TEST_IDS.ORG_ID),
    ).resolves.toBe(true);
  });

  it('does not treat users.role=owner (another org) as owner of this org', async () => {
    // Owner of their own default org, invited as a plain user into this one.
    userRepo.findOne.mockResolvedValue({
      id: TEST_IDS.USER_ID,
      organizationId: OTHER_ORG_ID,
      role: 'owner',
    });
    orgMemberRepo.findOne.mockResolvedValue({ role: 'user' });
    projectQb.getRawOne.mockResolvedValue(project());
    projectMemberRepo.findOne.mockResolvedValue(null);

    await expect(
      service.checkPermission(TEST_IDS.USER_ID, TEST_IDS.PROJECT_ID, 'issue', 'read', TEST_IDS.ORG_ID),
    ).resolves.toBe(false);
  });

  it('denies a resource whose project belongs to a different org than the caller', async () => {
    // Hint is an issue UUID from another tenant where the caller IS a member.
    projectQb.getRawOne.mockResolvedValue(null);
    rawQb.getRawOne.mockResolvedValue(project(OTHER_ORG_ID));
    projectMemberRepo.findOne.mockResolvedValue(mockProjectMember({ role: 'member' }));

    await expect(
      service.checkPermission(TEST_IDS.USER_ID, TEST_IDS.ISSUE_ID, 'issue', 'read', TEST_IDS.ORG_ID),
    ).resolves.toBe(false);
  });

  it('denies a foreign-org project UUID even for an admin of the caller org', async () => {
    // UUID lookups are not org-filtered, so the foreign project resolves and is
    // rejected by the cross-org check instead of hitting the admin fallback.
    orgMemberRepo.findOne.mockResolvedValue({ role: 'administrator' });
    projectQb.getRawOne.mockResolvedValue(project(OTHER_ORG_ID));

    await expect(
      service.checkPermission(TEST_IDS.USER_ID, TEST_IDS.PROJECT_ID, 'member', 'read', TEST_IDS.ORG_ID),
    ).resolves.toBe(false);
    expect(projectQb.andWhere).not.toHaveBeenCalled();
  });

  it('scopes project-key lookups to the caller org', async () => {
    projectQb.getRawOne.mockResolvedValue(project());
    projectMemberRepo.findOne.mockResolvedValue(mockProjectMember({ role: 'member' }));

    await service.checkPermission(TEST_IDS.USER_ID, 'lin', 'issue', 'read', TEST_IDS.ORG_ID);

    expect(projectQb.where).toHaveBeenCalledWith('p.key = :v', { v: 'LIN' });
    expect(projectQb.andWhere).toHaveBeenCalledWith('p.organization_id = :orgId', {
      orgId: TEST_IDS.ORG_ID,
    });
  });

  it('resolves a renamed project key through its org-scoped alias', async () => {
    projectQb.getRawOne.mockResolvedValue(null);
    rawQb.getRawOne.mockResolvedValue(project());
    projectMemberRepo.findOne.mockResolvedValue(mockProjectMember({ role: 'member' }));

    await expect(
      service.checkPermission(TEST_IDS.USER_ID, 'OLD', 'issue', 'read', TEST_IDS.ORG_ID),
    ).resolves.toBe(true);
    expect(rawQb.from).toHaveBeenCalledWith('project_key_aliases', 'a');
    expect(rawQb.where).toHaveBeenCalledWith('a.organization_id = :orgId AND a.old_key = :v', {
      orgId: TEST_IDS.ORG_ID,
      v: 'OLD',
    });
  });
});

describe('PermissionsService.checkPermissionForHints — mixed hints', () => {
  let service: PermissionsService;
  let projectMemberRepo: ReturnType<typeof createMockRepository>;
  let orgMemberRepo: ReturnType<typeof createMockRepository>;
  let projectQb: ReturnType<typeof createMockQueryBuilder>;
  let rawQb: ReturnType<typeof createMockQueryBuilder>;
  const PROJECT_A = TEST_IDS.PROJECT_ID;
  const PROJECT_B = '00000000-0000-4000-8000-0000000000cc';

  beforeEach(async () => {
    projectMemberRepo = createMockRepository();
    orgMemberRepo = createMockRepository();
    projectQb = createMockQueryBuilder();
    rawQb = createMockQueryBuilder();
    (rawQb as any).from = jest.fn().mockReturnThis();
    (projectMemberRepo as any).manager = {
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(projectQb),
      }),
      createQueryBuilder: jest.fn().mockReturnValue(rawQb),
    };
    orgMemberRepo.findOne.mockResolvedValue({ role: 'user' });
    const roleRepo = createMockRepository();
    roleRepo.findOne.mockResolvedValue({ permissions: [{ resource: 'issue', action: 'read' }] });
    const userRepo = createMockRepository();
    userRepo.findOne.mockResolvedValue({ id: TEST_IDS.USER_ID, organizationId: TEST_IDS.ORG_ID, role: 'user' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: getRepositoryToken(Permission), useValue: createMockRepository() },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(ProjectMember), useValue: projectMemberRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(OrganizationMember), useValue: orgMemberRepo },
      ],
    }).compile();
    service = module.get(PermissionsService);

    // Hint 'A' is project A (member); the issue UUID lives in project B (not a member).
    projectQb.getRawOne.mockImplementation(async () => {
      const calls = (projectQb.where as jest.Mock).mock.calls;
      const [, params] = calls[calls.length - 1];
      return params.v === 'A' ? { id: PROJECT_A, organizationId: TEST_IDS.ORG_ID } : null;
    });
    rawQb.getRawOne.mockResolvedValue({ id: PROJECT_B, organizationId: TEST_IDS.ORG_ID });
    projectMemberRepo.findOne.mockImplementation(async ({ where }: any) =>
      where.projectId === PROJECT_A ? mockProjectMember({ role: 'member' }) : null,
    );
  });

  it('denies when ?projectId points at an accessible project but :id is in another project', async () => {
    await expect(
      service.checkPermissionForHints(TEST_IDS.USER_ID, ['A', TEST_IDS.ISSUE_ID], 'issue', 'read', TEST_IDS.ORG_ID),
    ).resolves.toBe(false);
  });

  it('allows when every resolvable hint grants the permission', async () => {
    await expect(
      service.checkPermissionForHints(TEST_IDS.USER_ID, ['A'], 'issue', 'read', TEST_IDS.ORG_ID),
    ).resolves.toBe(true);
  });

  it('ignores hints that resolve to no project (e.g. board UUIDs)', async () => {
    rawQb.getRawOne.mockResolvedValue(null);
    await expect(
      service.checkPermissionForHints(TEST_IDS.USER_ID, ['A', TEST_IDS.ISSUE_ID], 'issue', 'read', TEST_IDS.ORG_ID),
    ).resolves.toBe(true);
  });

  it('denies a bulk request when any issue lives in a project the caller cannot access', async () => {
    rawQb.getRawMany.mockResolvedValue([
      { id: PROJECT_A, organizationId: TEST_IDS.ORG_ID },
      { id: PROJECT_B, organizationId: TEST_IDS.ORG_ID },
    ]);

    await expect(
      service.checkPermissionForHints(TEST_IDS.USER_ID, [], 'issue', 'delete', TEST_IDS.ORG_ID, [
        TEST_IDS.ISSUE_ID,
        '55555555-5555-4555-8555-555555555555',
      ]),
    ).resolves.toBe(false);
    expect(rawQb.where).toHaveBeenCalledWith('i.id IN (:...uuids) AND i.deleted_at IS NULL', {
      uuids: [TEST_IDS.ISSUE_ID, '55555555-5555-4555-8555-555555555555'],
    });
  });

  it('still allows an org administrator across both projects', async () => {
    orgMemberRepo.findOne.mockResolvedValue({ role: 'administrator' });
    await expect(
      service.checkPermissionForHints(TEST_IDS.USER_ID, ['A', TEST_IDS.ISSUE_ID], 'issue', 'read', TEST_IDS.ORG_ID),
    ).resolves.toBe(true);
  });
});
