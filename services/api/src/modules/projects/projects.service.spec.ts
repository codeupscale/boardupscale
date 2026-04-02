import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { AuditService } from '../audit/audit.service';
import { createMockRepository, createMockQueryBuilder, mockUpdateResult } from '../../test/test-utils';
import { mockProject, mockProjectMember, mockIssueStatus, TEST_IDS } from '../../test/mock-factories';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectRepo: ReturnType<typeof createMockRepository>;
  let memberRepo: ReturnType<typeof createMockRepository>;
  let statusRepo: ReturnType<typeof createMockRepository>;

  beforeEach(async () => {
    projectRepo = createMockRepository();
    memberRepo = createMockRepository();
    statusRepo = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getRepositoryToken(Project), useValue: projectRepo },
        { provide: getRepositoryToken(ProjectMember), useValue: memberRepo },
        { provide: getRepositoryToken(IssueStatus), useValue: statusRepo },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return projects for organization where user is a member (non-admin)', async () => {
      const projects = [mockProject()];
      const qb = createMockQueryBuilder(projects);
      projectRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll(TEST_IDS.ORG_ID, TEST_IDS.USER_ID, 'member');

      expect(result).toEqual(projects);
      expect(qb.where).toHaveBeenCalledWith('project.organization_id = :organizationId', {
        organizationId: TEST_IDS.ORG_ID,
      });
      expect(qb.innerJoin).toHaveBeenCalled();
    });

    it('should return all org projects for owner without membership join', async () => {
      const projects = [mockProject()];
      const qb = createMockQueryBuilder(projects);
      projectRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll(TEST_IDS.ORG_ID, TEST_IDS.USER_ID, 'owner');

      expect(result).toEqual(projects);
      expect(qb.innerJoin).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return project by id and org', async () => {
      const project = mockProject();
      projectRepo.findOne.mockResolvedValue(project);

      const result = await service.findById(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID);

      expect(result).toEqual(project);
      expect(projectRepo.findOne).toHaveBeenCalledWith({
        where: { id: TEST_IDS.PROJECT_ID, organizationId: TEST_IDS.ORG_ID },
        relations: ['owner'],
      });
    });

    it('should throw NotFoundException when project not found', async () => {
      projectRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('bad-id', TEST_IDS.ORG_ID)).rejects.toThrow(NotFoundException);
      await expect(service.findById('bad-id', TEST_IDS.ORG_ID)).rejects.toThrow('Project not found');
    });
  });

  describe('create', () => {
    const createDto = {
      name: 'New Project',
      key: 'NEWPROJ',
      description: 'A new project',
      type: 'software',
    };

    it('should create project with default statuses and owner membership', async () => {
      projectRepo.findOne.mockResolvedValueOnce(null); // key not taken
      const project = mockProject({ name: 'New Project', key: 'NEWPROJ' });
      projectRepo.create.mockReturnValue(project);
      projectRepo.save.mockResolvedValue(project);
      const member = mockProjectMember({ role: 'admin' });
      memberRepo.create.mockReturnValue(member);
      memberRepo.save.mockResolvedValue(member);
      statusRepo.create.mockImplementation((data) => data);
      statusRepo.save.mockResolvedValue([]);

      const result = await service.create(createDto, TEST_IDS.ORG_ID, TEST_IDS.USER_ID);

      expect(result).toEqual(project);
      expect(projectRepo.create).toHaveBeenCalledWith({
        ...createDto,
        organizationId: TEST_IDS.ORG_ID,
        ownerId: TEST_IDS.USER_ID,
        status: 'active',
        nextIssueNumber: 1,
      });
      expect(memberRepo.create).toHaveBeenCalledWith({
        projectId: project.id,
        userId: TEST_IDS.USER_ID,
        role: 'admin',
      });
      expect(statusRepo.create).toHaveBeenCalledTimes(4);
      expect(statusRepo.save).toHaveBeenCalled();
    });

    it('should throw ConflictException when project key already exists', async () => {
      projectRepo.findOne.mockResolvedValueOnce(mockProject()); // key already taken

      await expect(service.create(createDto, TEST_IDS.ORG_ID, TEST_IDS.USER_ID)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update project fields', async () => {
      const project = mockProject();
      const updatedProject = mockProject({ name: 'Updated' });
      projectRepo.findOne.mockResolvedValue(project);
      projectRepo.save.mockResolvedValue(updatedProject);

      const result = await service.update(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, { name: 'Updated' });

      expect(result).toEqual(updatedProject);
    });

    it('should throw NotFoundException when project not found', async () => {
      projectRepo.findOne.mockResolvedValue(null);

      await expect(service.update('bad-id', TEST_IDS.ORG_ID, { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('archive', () => {
    it('should set project status to archived', async () => {
      const project = mockProject();
      projectRepo.findOne.mockResolvedValue(project);
      projectRepo.update.mockResolvedValue(mockUpdateResult());

      await service.archive(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID);

      expect(projectRepo.update).toHaveBeenCalledWith(project.id, { status: 'archived' });
    });
  });

  describe('getMembers', () => {
    it('should return members for a project', async () => {
      const project = mockProject();
      projectRepo.findOne.mockResolvedValue(project);
      const members = [mockProjectMember()];
      memberRepo.find.mockResolvedValue(members);

      const result = await service.getMembers(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID);

      expect(result).toEqual(members);
      expect(memberRepo.find).toHaveBeenCalledWith({
        where: { projectId: TEST_IDS.PROJECT_ID },
        relations: ['user'],
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('addMember', () => {
    it('should add a new member to the project', async () => {
      const project = mockProject();
      projectRepo.findOne.mockResolvedValue(project);
      memberRepo.findOne.mockResolvedValue(null); // not already a member
      const newMember = mockProjectMember({ userId: 'new-user-id', role: 'developer' });
      memberRepo.create.mockReturnValue(newMember);
      memberRepo.save.mockResolvedValue(newMember);

      const result = await service.addMember(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
        userId: 'new-user-id',
        role: 'developer',
      });

      expect(result).toEqual(newMember);
    });

    it('should throw ConflictException when user is already a member', async () => {
      const project = mockProject();
      projectRepo.findOne.mockResolvedValue(project);
      memberRepo.findOne.mockResolvedValue(mockProjectMember());

      await expect(
        service.addMember(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
          userId: TEST_IDS.USER_ID,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('removeMember', () => {
    it('should remove a member from the project', async () => {
      const otherUserId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      const project = mockProject();
      projectRepo.findOne.mockResolvedValue(project);
      const member = mockProjectMember({ userId: otherUserId, role: 'developer' });
      memberRepo.findOne.mockResolvedValue(member);
      memberRepo.remove.mockResolvedValue(member);

      await service.removeMember(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, otherUserId);

      expect(memberRepo.remove).toHaveBeenCalledWith(member);
    });

    it('should throw NotFoundException when member not found', async () => {
      const project = mockProject();
      projectRepo.findOne.mockResolvedValue(project);
      memberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.removeMember(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, 'unknown-user'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when trying to remove the owner', async () => {
      const project = mockProject(); // ownerId defaults to TEST_IDS.USER_ID
      projectRepo.findOne.mockResolvedValue(project);
      const ownerMember = mockProjectMember({ role: 'admin' });
      memberRepo.findOne.mockResolvedValue(ownerMember);

      await expect(
        service.removeMember(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, TEST_IDS.USER_ID),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.removeMember(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, TEST_IDS.USER_ID),
      ).rejects.toThrow('Cannot remove the project owner');
    });
  });

  describe('isMember', () => {
    it('should return true when user is a member', async () => {
      memberRepo.findOne.mockResolvedValue(mockProjectMember());

      const result = await service.isMember(TEST_IDS.PROJECT_ID, TEST_IDS.USER_ID);

      expect(result).toBe(true);
    });

    it('should return false when user is not a member', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      const result = await service.isMember(TEST_IDS.PROJECT_ID, 'unknown-user');

      expect(result).toBe(false);
    });
  });

  describe('getNextIssueNumber', () => {
    it('should return current number and increment', async () => {
      const project = mockProject({ nextIssueNumber: 5 });
      projectRepo.findOne.mockResolvedValue(project);
      projectRepo.update.mockResolvedValue(mockUpdateResult());

      const result = await service.getNextIssueNumber(TEST_IDS.PROJECT_ID);

      expect(result).toBe(5);
      expect(projectRepo.update).toHaveBeenCalledWith(TEST_IDS.PROJECT_ID, { nextIssueNumber: 6 });
    });

    it('should throw NotFoundException when project not found', async () => {
      projectRepo.findOne.mockResolvedValue(null);

      await expect(service.getNextIssueNumber('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
