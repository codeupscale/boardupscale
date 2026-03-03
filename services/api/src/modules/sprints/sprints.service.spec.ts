import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SprintsService } from './sprints.service';
import { Sprint } from './entities/sprint.entity';
import { Issue } from '../issues/entities/issue.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { ProjectsService } from '../projects/projects.service';
import { WebhookEventEmitter } from '../webhooks/webhook-event-emitter.service';
import { AutomationEngineService } from '../automation/automation-engine.service';
import {
  createMockRepository,
  createMockQueryBuilder,
  createMockProjectsService,
} from '../../test/test-utils';
import { mockSprint, mockProject, mockIssue, mockIssueStatus, TEST_IDS } from '../../test/mock-factories';

describe('SprintsService', () => {
  let service: SprintsService;
  let sprintRepo: ReturnType<typeof createMockRepository>;
  let issueRepo: ReturnType<typeof createMockRepository>;
  let statusRepo: ReturnType<typeof createMockRepository>;
  let projectsService: ReturnType<typeof createMockProjectsService>;

  beforeEach(async () => {
    sprintRepo = createMockRepository();
    issueRepo = createMockRepository();
    statusRepo = createMockRepository();
    projectsService = createMockProjectsService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SprintsService,
        { provide: getRepositoryToken(Sprint), useValue: sprintRepo },
        { provide: getRepositoryToken(Issue), useValue: issueRepo },
        { provide: getRepositoryToken(IssueStatus), useValue: statusRepo },
        { provide: ProjectsService, useValue: projectsService },
        { provide: WebhookEventEmitter, useValue: { emit: jest.fn().mockResolvedValue(undefined) } },
        { provide: AutomationEngineService, useValue: { processTrigger: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<SprintsService>(SprintsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return sprints for a project', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      const sprints = [mockSprint()];
      sprintRepo.find.mockResolvedValue(sprints);

      const result = await service.findAll(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID);

      expect(result).toEqual(sprints);
      expect(sprintRepo.find).toHaveBeenCalledWith({
        where: { projectId: TEST_IDS.PROJECT_ID },
        order: { createdAt: 'DESC' },
      });
    });

    it('should verify project exists', async () => {
      projectsService.findById.mockRejectedValue(new NotFoundException('Project not found'));

      await expect(service.findAll('bad-id', TEST_IDS.ORG_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should return sprint with project relation', async () => {
      const sprint = mockSprint();
      sprintRepo.findOne.mockResolvedValue(sprint);

      const result = await service.findById(TEST_IDS.SPRINT_ID);

      expect(result).toEqual(sprint);
      expect(sprintRepo.findOne).toHaveBeenCalledWith({
        where: { id: TEST_IDS.SPRINT_ID },
        relations: ['project'],
      });
    });

    it('should throw NotFoundException when sprint not found', async () => {
      sprintRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('bad-id')).rejects.toThrow(NotFoundException);
      await expect(service.findById('bad-id')).rejects.toThrow('Sprint not found');
    });
  });

  describe('create', () => {
    it('should create a sprint with planned status', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      const sprint = mockSprint({ status: 'planned' });
      sprintRepo.create.mockReturnValue(sprint);
      sprintRepo.save.mockResolvedValue(sprint);

      const result = await service.create(
        { projectId: TEST_IDS.PROJECT_ID, name: 'Sprint 1' },
        TEST_IDS.ORG_ID,
      );

      expect(result).toEqual(sprint);
      expect(sprintRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'planned' }),
      );
    });
  });

  describe('update', () => {
    it('should update sprint fields', async () => {
      const sprint = mockSprint();
      sprintRepo.findOne.mockResolvedValue(sprint);
      projectsService.findById.mockResolvedValue(mockProject());
      const updated = mockSprint({ name: 'Updated Sprint' });
      sprintRepo.save.mockResolvedValue(updated);

      const result = await service.update(TEST_IDS.SPRINT_ID, TEST_IDS.ORG_ID, { name: 'Updated Sprint' });

      expect(result).toEqual(updated);
    });
  });

  describe('start', () => {
    it('should activate a planned sprint', async () => {
      const sprint = mockSprint({ status: 'planned' });
      sprintRepo.findOne.mockImplementation((opts: any) => {
        if (opts?.where?.id) return Promise.resolve(sprint);
        if (opts?.where?.status === 'active') return Promise.resolve(null);
        return Promise.resolve(null);
      });
      projectsService.findById.mockResolvedValue(mockProject());
      const activatedSprint = mockSprint({ status: 'active' });
      sprintRepo.save.mockResolvedValue(activatedSprint);

      const result = await service.start(TEST_IDS.SPRINT_ID, TEST_IDS.ORG_ID);

      expect(result).toEqual(activatedSprint);
    });

    it('should throw BadRequestException when sprint is not planned', async () => {
      const sprint = mockSprint({ status: 'active' });
      sprintRepo.findOne.mockResolvedValue(sprint);
      projectsService.findById.mockResolvedValue(mockProject());

      await expect(service.start(TEST_IDS.SPRINT_ID, TEST_IDS.ORG_ID)).rejects.toThrow(BadRequestException);
      await expect(service.start(TEST_IDS.SPRINT_ID, TEST_IDS.ORG_ID)).rejects.toThrow(
        'Only planned sprints can be started',
      );
    });

    it('should throw BadRequestException when another sprint is already active', async () => {
      const sprint = mockSprint({ status: 'planned' });
      const activeSprint = mockSprint({ id: 'other-sprint', status: 'active' });

      sprintRepo.findOne.mockImplementation((opts: any) => {
        if (opts?.where?.id) return Promise.resolve(sprint);
        if (opts?.where?.status === 'active') return Promise.resolve(activeSprint);
        return Promise.resolve(null);
      });
      projectsService.findById.mockResolvedValue(mockProject());

      await expect(service.start(TEST_IDS.SPRINT_ID, TEST_IDS.ORG_ID)).rejects.toThrow(BadRequestException);
      await expect(service.start(TEST_IDS.SPRINT_ID, TEST_IDS.ORG_ID)).rejects.toThrow(
        'There is already an active sprint',
      );
    });

    it('should set startDate to today if not already set', async () => {
      const sprint = mockSprint({ status: 'planned', startDate: null });
      sprintRepo.findOne.mockImplementation((opts: any) => {
        if (opts?.where?.id) return Promise.resolve(sprint);
        if (opts?.where?.status === 'active') return Promise.resolve(null);
        return Promise.resolve(null);
      });
      projectsService.findById.mockResolvedValue(mockProject());
      sprintRepo.save.mockImplementation((s) => Promise.resolve(s));

      const result = await service.start(TEST_IDS.SPRINT_ID, TEST_IDS.ORG_ID);

      expect(result.status).toBe('active');
      expect(result.startDate).toBeTruthy();
    });
  });

  describe('complete', () => {
    it('should complete an active sprint', async () => {
      const sprint = mockSprint({ status: 'active' });
      sprintRepo.findOne.mockResolvedValue(sprint);
      projectsService.findById.mockResolvedValue(mockProject());

      const doneStatus = mockIssueStatus({ id: 'done-status', category: 'done' });
      statusRepo.find.mockResolvedValue([doneStatus]);

      const qb = createMockQueryBuilder([]);
      qb.getMany.mockResolvedValue([]); // no incomplete issues
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      const completedSprint = mockSprint({ status: 'completed' });
      sprintRepo.save.mockResolvedValue(completedSprint);

      const result = await service.complete(TEST_IDS.SPRINT_ID, TEST_IDS.ORG_ID);

      expect(result).toEqual(completedSprint);
    });

    it('should throw BadRequestException when sprint is not active', async () => {
      const sprint = mockSprint({ status: 'planned' });
      sprintRepo.findOne.mockResolvedValue(sprint);
      projectsService.findById.mockResolvedValue(mockProject());

      await expect(service.complete(TEST_IDS.SPRINT_ID, TEST_IDS.ORG_ID)).rejects.toThrow(BadRequestException);
      await expect(service.complete(TEST_IDS.SPRINT_ID, TEST_IDS.ORG_ID)).rejects.toThrow(
        'Only active sprints can be completed',
      );
    });

    it('should move incomplete issues to backlog when completing', async () => {
      const sprint = mockSprint({ status: 'active' });
      sprintRepo.findOne.mockResolvedValue(sprint);
      projectsService.findById.mockResolvedValue(mockProject());

      const doneStatus = mockIssueStatus({ id: 'done-status', category: 'done' });
      statusRepo.find.mockResolvedValue([doneStatus]);

      const incompleteIssues = [mockIssue({ id: 'incomplete-1' })];
      const findQb = createMockQueryBuilder(incompleteIssues);
      findQb.getMany.mockResolvedValue(incompleteIssues);
      const updateQb = createMockQueryBuilder();
      issueRepo.createQueryBuilder
        .mockReturnValueOnce(findQb)
        .mockReturnValueOnce(updateQb);

      sprintRepo.save.mockImplementation((s) => Promise.resolve(s));

      await service.complete(TEST_IDS.SPRINT_ID, TEST_IDS.ORG_ID);

      // The update query builder was used to set sprintId to null
      expect(updateQb.set).toHaveBeenCalledWith({ sprintId: null });
    });
  });

  describe('delete', () => {
    it('should delete a planned sprint and unlink issues', async () => {
      const sprint = mockSprint({ status: 'planned' });
      sprintRepo.findOne.mockResolvedValue(sprint);
      projectsService.findById.mockResolvedValue(mockProject());

      const qb = createMockQueryBuilder();
      issueRepo.createQueryBuilder.mockReturnValue(qb);
      sprintRepo.remove.mockResolvedValue(sprint);

      await service.delete(TEST_IDS.SPRINT_ID, TEST_IDS.ORG_ID);

      expect(qb.set).toHaveBeenCalledWith({ sprintId: null });
      expect(sprintRepo.remove).toHaveBeenCalledWith(sprint);
    });

    it('should throw BadRequestException when trying to delete an active sprint', async () => {
      const sprint = mockSprint({ status: 'active' });
      sprintRepo.findOne.mockResolvedValue(sprint);
      projectsService.findById.mockResolvedValue(mockProject());

      await expect(service.delete(TEST_IDS.SPRINT_ID, TEST_IDS.ORG_ID)).rejects.toThrow(BadRequestException);
      await expect(service.delete(TEST_IDS.SPRINT_ID, TEST_IDS.ORG_ID)).rejects.toThrow(
        'Cannot delete an active sprint',
      );
    });

    it('should allow deleting a completed sprint', async () => {
      const sprint = mockSprint({ status: 'completed' });
      sprintRepo.findOne.mockResolvedValue(sprint);
      projectsService.findById.mockResolvedValue(mockProject());

      const qb = createMockQueryBuilder();
      issueRepo.createQueryBuilder.mockReturnValue(qb);
      sprintRepo.remove.mockResolvedValue(sprint);

      await service.delete(TEST_IDS.SPRINT_ID, TEST_IDS.ORG_ID);

      expect(sprintRepo.remove).toHaveBeenCalledWith(sprint);
    });
  });
});
