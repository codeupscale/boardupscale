import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { SearchService } from '@/modules/search/search.service';
import { Issue } from '@/modules/issues/entities/issue.entity';
import { Project } from '@/modules/projects/entities/project.entity';
import { ProjectMember } from '@/modules/projects/entities/project-member.entity';
import { ProjectKeyAlias } from '@/modules/projects/entities/project-key-alias.entity';
import { User } from '@/modules/users/entities/user.entity';
import { createMockRepository, createMockQueryBuilder } from '@/test/test-utils';
import { mockIssue, TEST_IDS } from '@/test/mock-factories';

describe('SearchService', () => {
  let service: SearchService;
  let issueRepo: ReturnType<typeof createMockRepository>;
  let projectRepo: ReturnType<typeof createMockRepository>;
  let projectMemberRepo: ReturnType<typeof createMockRepository>;
  let userRepo: ReturnType<typeof createMockRepository>;
  let aliasRepo: ReturnType<typeof createMockRepository>;

  beforeEach(async () => {
    issueRepo = createMockRepository();
    projectRepo = createMockRepository();
    projectMemberRepo = createMockRepository();
    userRepo = createMockRepository();
    aliasRepo = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: getRepositoryToken(Issue), useValue: issueRepo },
        { provide: getRepositoryToken(Project), useValue: projectRepo },
        { provide: getRepositoryToken(ProjectMember), useValue: projectMemberRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(ProjectKeyAlias), useValue: aliasRepo },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'elasticsearch.url') return null;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveSearchScope', () => {
    it('grants org-wide scope to owner', async () => {
      const scope = await service.resolveSearchScope({
        organizationId: TEST_IDS.ORG_ID,
        userId: TEST_IDS.USER_ID,
        orgRole: 'owner',
      });
      expect(scope.orgWide).toBe(true);
      expect(scope.accessibleProjectIds).toBeNull();
    });

    it('grants org-wide scope to administrator regardless of membership', async () => {
      const scope = await service.resolveSearchScope({
        organizationId: TEST_IDS.ORG_ID,
        userId: TEST_IDS.USER_ID,
        orgRole: 'administrator',
      });
      expect(scope.orgWide).toBe(true);
      expect(scope.accessibleProjectIds).toBeNull();
      expect(projectMemberRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('restricts org user to accessible project memberships', async () => {
      const pmQb = createMockQueryBuilder([]);
      pmQb.getRawMany.mockResolvedValue([{ projectId: TEST_IDS.PROJECT_ID }]);
      projectMemberRepo.createQueryBuilder.mockReturnValue(pmQb);

      const scope = await service.resolveSearchScope({
        organizationId: TEST_IDS.ORG_ID,
        userId: TEST_IDS.USER_ID,
        orgRole: 'user',
      });

      expect(scope.orgWide).toBe(false);
      expect(scope.accessibleProjectIds).toEqual([TEST_IDS.PROJECT_ID]);
    });

    it('rejects projectId outside accessible projects for org user', async () => {
      const pmQb = createMockQueryBuilder([]);
      pmQb.getRawMany.mockResolvedValue([{ projectId: TEST_IDS.PROJECT_ID }]);
      projectMemberRepo.createQueryBuilder.mockReturnValue(pmQb);

      await expect(
        service.resolveSearchScope({
          organizationId: TEST_IDS.ORG_ID,
          userId: TEST_IDS.USER_ID,
          orgRole: 'user',
          projectId: '99999999-9999-9999-9999-999999999999',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('validates projectId belongs to org for owner', async () => {
      projectRepo.exist.mockResolvedValue(false);

      await expect(
        service.resolveSearchScope({
          organizationId: TEST_IDS.ORG_ID,
          userId: TEST_IDS.USER_ID,
          orgRole: 'owner',
          projectId: '99999999-9999-9999-9999-999999999999',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('search', () => {
    function mockScopedMembership(projectIds: string[] = [TEST_IDS.PROJECT_ID]) {
      const pmQb = createMockQueryBuilder([]);
      pmQb.getRawMany.mockResolvedValue(projectIds.map((projectId) => ({ projectId })));
      projectMemberRepo.createQueryBuilder.mockReturnValue(pmQb);
    }

    it('returns matching issues for org user (PostgreSQL fallback)', async () => {
      mockScopedMembership();
      const issue = mockIssue({ title: 'Login bug fix' });
      const issueQb = createMockQueryBuilder([issue]);
      issueQb.getMany.mockResolvedValue([issue]);
      issueRepo.createQueryBuilder.mockReturnValue(issueQb);

      const projectQb = createMockQueryBuilder([]);
      projectQb.getMany.mockResolvedValue([]);
      projectRepo.createQueryBuilder.mockReturnValue(projectQb);

      const memberQb = createMockQueryBuilder([]);
      memberQb.getRawMany.mockResolvedValue([]);
      userRepo.createQueryBuilder.mockReturnValue(memberQb);

      const result = await service.search({
        q: 'login',
        organizationId: TEST_IDS.ORG_ID,
        userId: TEST_IDS.USER_ID,
        orgRole: 'user',
      });

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].kind).toBe('issue');
      expect(result.totals.issues).toBe(1);
      expect(result.source).toBe('postgresql');
      expect(issueQb.andWhere).toHaveBeenCalledWith(
        'issue.project_id IN (:...projectIds)',
        { projectIds: [TEST_IDS.PROJECT_ID] },
      );
    });

    it('returns empty results for empty query', async () => {
      const result = await service.search({
        q: '',
        organizationId: TEST_IDS.ORG_ID,
        userId: TEST_IDS.USER_ID,
        orgRole: 'user',
      });

      expect(result).toEqual({
        issues: [],
        projects: [],
        members: [],
        totals: { issues: 0, projects: 0, members: 0 },
        source: 'postgresql',
      });
      expect(issueRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns empty when org user has no project memberships', async () => {
      mockScopedMembership([]);

      const result = await service.search({
        q: 'test',
        organizationId: TEST_IDS.ORG_ID,
        userId: TEST_IDS.USER_ID,
        orgRole: 'user',
      });

      expect(result.totals).toEqual({ issues: 0, projects: 0, members: 0 });
      expect(issueRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('does not apply membership filter for owner', async () => {
      const issueQb = createMockQueryBuilder([]);
      issueQb.getMany.mockResolvedValue([]);
      issueRepo.createQueryBuilder.mockReturnValue(issueQb);

      const projectQb = createMockQueryBuilder([]);
      projectQb.getMany.mockResolvedValue([]);
      projectRepo.createQueryBuilder.mockReturnValue(projectQb);

      const memberQb = createMockQueryBuilder([]);
      memberQb.getRawMany.mockResolvedValue([]);
      userRepo.createQueryBuilder.mockReturnValue(memberQb);

      await service.search({
        q: 'test',
        organizationId: TEST_IDS.ORG_ID,
        userId: TEST_IDS.USER_ID,
        orgRole: 'owner',
      });

      expect(projectMemberRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(issueQb.andWhere).not.toHaveBeenCalledWith(
        'issue.project_id IN (:...projectIds)',
        expect.anything(),
      );
    });

    it('scopes project search to accessible projects for org user', async () => {
      mockScopedMembership([TEST_IDS.PROJECT_ID]);

      const issueQb = createMockQueryBuilder([]);
      issueQb.getMany.mockResolvedValue([]);
      issueRepo.createQueryBuilder.mockReturnValue(issueQb);

      const projectQb = createMockQueryBuilder([]);
      projectQb.getMany.mockResolvedValue([]);
      projectRepo.createQueryBuilder.mockReturnValue(projectQb);

      const memberQb = createMockQueryBuilder([]);
      memberQb.getRawMany.mockResolvedValue([]);
      userRepo.createQueryBuilder.mockReturnValue(memberQb);

      await service.search({
        q: 'alpha',
        organizationId: TEST_IDS.ORG_ID,
        userId: TEST_IDS.USER_ID,
        orgRole: 'user',
      });

      expect(projectQb.andWhere).toHaveBeenCalledWith(
        'project.id IN (:...projectIds)',
        { projectIds: [TEST_IDS.PROJECT_ID] },
      );
    });

    it('scopes member search to project memberships for org user', async () => {
      mockScopedMembership([TEST_IDS.PROJECT_ID]);

      const issueQb = createMockQueryBuilder([]);
      issueQb.getMany.mockResolvedValue([]);
      issueRepo.createQueryBuilder.mockReturnValue(issueQb);

      const projectQb = createMockQueryBuilder([]);
      projectQb.getMany.mockResolvedValue([]);
      projectRepo.createQueryBuilder.mockReturnValue(projectQb);

      const memberQb = createMockQueryBuilder([]);
      memberQb.getRawMany.mockResolvedValue([]);
      userRepo.createQueryBuilder.mockReturnValue(memberQb);

      await service.search({
        q: 'alice',
        organizationId: TEST_IDS.ORG_ID,
        userId: TEST_IDS.USER_ID,
        orgRole: 'user',
      });

      expect(memberQb.innerJoin).toHaveBeenCalledWith('project_members', 'pm', 'pm.user_id = user.id');
      expect(memberQb.innerJoin).toHaveBeenCalledWith(
        'projects',
        'p',
        'p.id = pm.project_id AND p.organization_id = :organizationId',
        { organizationId: TEST_IDS.ORG_ID },
      );
      expect(memberQb.andWhere).toHaveBeenCalledWith('pm.project_id IN (:...projectIds)', {
        projectIds: [TEST_IDS.PROJECT_ID],
      });
      expect(memberQb.innerJoin).not.toHaveBeenCalledWith(
        'organization_members',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it('searches org-wide members for administrator without membership lookup', async () => {
      const issueQb = createMockQueryBuilder([]);
      issueQb.getMany.mockResolvedValue([]);
      issueRepo.createQueryBuilder.mockReturnValue(issueQb);

      const projectQb = createMockQueryBuilder([]);
      projectQb.getMany.mockResolvedValue([]);
      projectRepo.createQueryBuilder.mockReturnValue(projectQb);

      const memberQb = createMockQueryBuilder([]);
      memberQb.getRawMany.mockResolvedValue([]);
      userRepo.createQueryBuilder.mockReturnValue(memberQb);

      await service.search({
        q: 'bob',
        organizationId: TEST_IDS.ORG_ID,
        userId: TEST_IDS.USER_ID,
        orgRole: 'administrator',
      });

      expect(projectMemberRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(memberQb.innerJoin).toHaveBeenCalledWith(
        'organization_members',
        'om',
        'om.user_id = user.id AND om.organization_id = :organizationId',
        { organizationId: TEST_IDS.ORG_ID },
      );
    });

    it('always scopes issue queries to the requesting organization', async () => {
      mockScopedMembership();

      const issueQb = createMockQueryBuilder([]);
      issueQb.getMany.mockResolvedValue([]);
      issueRepo.createQueryBuilder.mockReturnValue(issueQb);

      const projectQb = createMockQueryBuilder([]);
      projectQb.getMany.mockResolvedValue([]);
      projectRepo.createQueryBuilder.mockReturnValue(projectQb);

      const memberQb = createMockQueryBuilder([]);
      memberQb.getRawMany.mockResolvedValue([]);
      userRepo.createQueryBuilder.mockReturnValue(memberQb);

      await service.search({
        q: 'tenant',
        organizationId: TEST_IDS.ORG_ID,
        userId: TEST_IDS.USER_ID,
        orgRole: 'user',
      });

      expect(issueQb.where).toHaveBeenCalledWith(
        'issue.organization_id = :organizationId',
        { organizationId: TEST_IDS.ORG_ID },
      );
      expect(projectQb.where).toHaveBeenCalledWith(
        'project.organization_id = :organizationId',
        { organizationId: TEST_IDS.ORG_ID },
      );
    });
  });

  describe('tenant isolation', () => {
    it('filters accessible projects by organization when resolving scope', async () => {
      const pmQb = createMockQueryBuilder([]);
      pmQb.getRawMany.mockResolvedValue([{ projectId: TEST_IDS.PROJECT_ID }]);
      projectMemberRepo.createQueryBuilder.mockReturnValue(pmQb);

      await service.resolveSearchScope({
        organizationId: TEST_IDS.ORG_ID,
        userId: TEST_IDS.USER_ID,
        orgRole: 'user',
      });

      expect(pmQb.innerJoin).toHaveBeenCalledWith('projects', 'p', 'p.id = pm.project_id');
      expect(pmQb.where).toHaveBeenCalledWith('pm.user_id = :userId', {
        userId: TEST_IDS.USER_ID,
      });
      expect(pmQb.andWhere).toHaveBeenCalledWith('p.organization_id = :organizationId', {
        organizationId: TEST_IDS.ORG_ID,
      });
    });
  });

  describe('findSimilar', () => {
    it('rejects projectId outside accessible projects for org user', async () => {
      const pmQb = createMockQueryBuilder([]);
      pmQb.getRawMany.mockResolvedValue([{ projectId: TEST_IDS.PROJECT_ID }]);
      projectMemberRepo.createQueryBuilder.mockReturnValue(pmQb);

      await expect(
        service.findSimilar({
          text: 'login regression bug',
          organizationId: TEST_IDS.ORG_ID,
          userId: TEST_IDS.USER_ID,
          orgRole: 'user',
          projectId: '99999999-9999-9999-9999-999999999999',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
