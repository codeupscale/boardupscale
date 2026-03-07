import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IssuesService } from './issues.service';
import { Issue } from './entities/issue.entity';
import { IssueStatus } from './entities/issue-status.entity';
import { WorkLog } from './entities/work-log.entity';
import { ProjectsService } from '../projects/projects.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { UsersService } from '../users/users.service';
import { EventsGateway } from '../../websocket/events.gateway';
import { WebhookEventEmitter } from '../webhooks/webhook-event-emitter.service';
import { AutomationEngineService } from '../automation/automation-engine.service';
import {
  createMockRepository,
  createMockQueryBuilder,
  createMockProjectsService,
  createMockNotificationsService,
  createMockEventsGateway,
  createMockConfigService,
  mockUpdateResult,
} from '../../test/test-utils';
import { mockIssue, mockIssueStatus, mockProject, mockWorkLog, mockUser, TEST_IDS } from '../../test/mock-factories';

describe('IssuesService', () => {
  let service: IssuesService;
  let issueRepo: ReturnType<typeof createMockRepository>;
  let statusRepo: ReturnType<typeof createMockRepository>;
  let workLogRepo: ReturnType<typeof createMockRepository>;
  let projectsService: ReturnType<typeof createMockProjectsService>;
  let notificationsService: ReturnType<typeof createMockNotificationsService>;
  let eventsGateway: ReturnType<typeof createMockEventsGateway>;
  let emailService: Record<string, jest.Mock>;
  let usersService: Record<string, jest.Mock>;

  beforeEach(async () => {
    issueRepo = createMockRepository();
    statusRepo = createMockRepository();
    workLogRepo = createMockRepository();
    projectsService = createMockProjectsService();
    notificationsService = createMockNotificationsService();
    eventsGateway = createMockEventsGateway();
    emailService = {
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendIssueAssignedEmail: jest.fn().mockResolvedValue(undefined),
      sendCommentMentionEmail: jest.fn().mockResolvedValue(undefined),
      sendSprintReminderEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };
    usersService = {
      findById: jest.fn().mockResolvedValue(mockUser()),
      findByEmail: jest.fn(),
      findByOrg: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssuesService,
        { provide: getRepositoryToken(Issue), useValue: issueRepo },
        { provide: getRepositoryToken(IssueStatus), useValue: statusRepo },
        { provide: getRepositoryToken(WorkLog), useValue: workLogRepo },
        { provide: ProjectsService, useValue: projectsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: EmailService, useValue: emailService },
        { provide: UsersService, useValue: usersService },
        { provide: ConfigService, useValue: createMockConfigService({ 'app.frontendUrl': 'http://localhost:3000' }) },
        { provide: EventsGateway, useValue: eventsGateway },
        { provide: WebhookEventEmitter, useValue: { emit: jest.fn().mockResolvedValue(undefined) } },
        { provide: AutomationEngineService, useValue: { processTrigger: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<IssuesService>(IssuesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated issues with default pagination', async () => {
      const issues = [mockIssue()];
      const qb = createMockQueryBuilder(issues);
      qb.getCount.mockResolvedValue(1);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll({ organizationId: TEST_IDS.ORG_ID });

      expect(result).toEqual({
        items: issues,
        total: 1,
        page: 1,
        limit: 20,
      });
      expect(qb.where).toHaveBeenCalledWith('issue.organization_id = :organizationId', {
        organizationId: TEST_IDS.ORG_ID,
      });
    });

    it('should apply project filter', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getCount.mockResolvedValue(0);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({
        organizationId: TEST_IDS.ORG_ID,
        projectId: TEST_IDS.PROJECT_ID,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('issue.project_id = :projectId', {
        projectId: TEST_IDS.PROJECT_ID,
      });
    });

    it('should apply sprint filter', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getCount.mockResolvedValue(0);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({
        organizationId: TEST_IDS.ORG_ID,
        sprintId: TEST_IDS.SPRINT_ID,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('issue.sprint_id = :sprintId', {
        sprintId: TEST_IDS.SPRINT_ID,
      });
    });

    it('should filter backlog issues (no sprint)', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getCount.mockResolvedValue(0);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({
        organizationId: TEST_IDS.ORG_ID,
        sprintId: 'backlog',
      });

      expect(qb.andWhere).toHaveBeenCalledWith('issue.sprint_id IS NULL');
    });

    it('should apply assignee, type, priority, status filters', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getCount.mockResolvedValue(0);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({
        organizationId: TEST_IDS.ORG_ID,
        assigneeId: TEST_IDS.USER_ID,
        type: 'bug',
        priority: 'high',
        statusId: TEST_IDS.STATUS_ID,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('issue.assignee_id = :assigneeId', { assigneeId: TEST_IDS.USER_ID });
      expect(qb.andWhere).toHaveBeenCalledWith('issue.type = :type', { type: 'bug' });
      expect(qb.andWhere).toHaveBeenCalledWith('issue.priority = :priority', { priority: 'high' });
      expect(qb.andWhere).toHaveBeenCalledWith('issue.status_id = :statusId', { statusId: TEST_IDS.STATUS_ID });
    });

    it('should apply search filter', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getCount.mockResolvedValue(0);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({
        organizationId: TEST_IDS.ORG_ID,
        search: 'login bug',
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        '(issue.title ILIKE :search OR issue.key ILIKE :search)',
        { search: '%login bug%' },
      );
    });

    it('should respect pagination params', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getCount.mockResolvedValue(50);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll({
        organizationId: TEST_IDS.ORG_ID,
        page: 3,
        limit: 10,
      });

      expect(qb.skip).toHaveBeenCalledWith(20); // (3-1) * 10
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
    });
  });

  describe('findById', () => {
    it('should return issue with relations', async () => {
      const issue = mockIssue();
      issueRepo.findOne.mockResolvedValue(issue);

      const result = await service.findById(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID);

      expect(result).toEqual(issue);
      expect(issueRepo.findOne).toHaveBeenCalledWith({
        where: { id: TEST_IDS.ISSUE_ID, organizationId: TEST_IDS.ORG_ID, deletedAt: expect.anything() },
        relations: ['status', 'assignee', 'reporter', 'sprint', 'parent', 'project'],
      });
    });

    it('should throw NotFoundException when issue not found', async () => {
      issueRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('bad-id', TEST_IDS.ORG_ID)).rejects.toThrow(NotFoundException);
      await expect(service.findById('bad-id', TEST_IDS.ORG_ID)).rejects.toThrow('Issue not found');
    });
  });

  describe('create', () => {
    const createDto = {
      projectId: TEST_IDS.PROJECT_ID,
      title: 'New Issue',
      type: 'task',
      priority: 'medium',
    };

    it('should create issue with generated key and default status', async () => {
      const project = mockProject({ key: 'TPROJ' });
      projectsService.findById.mockResolvedValue(project);
      const defaultStatus = mockIssueStatus({ isDefault: true });
      statusRepo.findOne.mockResolvedValue(defaultStatus);
      projectsService.getNextIssueNumber.mockResolvedValue(5);

      const createdIssue = mockIssue({ key: 'TPROJ-5', number: 5 });
      issueRepo.create.mockReturnValue(createdIssue);
      issueRepo.save.mockResolvedValue(createdIssue);

      const fullIssue = mockIssue({ key: 'TPROJ-5', number: 5 });
      issueRepo.findOne.mockResolvedValue(fullIssue);

      const result = await service.create(createDto as any, TEST_IDS.ORG_ID, TEST_IDS.USER_ID);

      expect(result).toEqual(fullIssue);
      expect(issueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'TPROJ-5',
          number: 5,
          position: 5,
          organizationId: TEST_IDS.ORG_ID,
          reporterId: TEST_IDS.USER_ID,
          statusId: defaultStatus.id,
        }),
      );
      expect(eventsGateway.emitToOrg).toHaveBeenCalledWith(TEST_IDS.ORG_ID, 'issue:created', fullIssue);
    });

    it('should send notification when assignee is different from reporter', async () => {
      const project = mockProject({ key: 'TPROJ' });
      projectsService.findById.mockResolvedValue(project);
      statusRepo.findOne.mockResolvedValue(mockIssueStatus());
      projectsService.getNextIssueNumber.mockResolvedValue(1);

      const assigneeId = 'assignee-user-id';
      const issue = mockIssue({ assigneeId });
      issueRepo.create.mockReturnValue(issue);
      issueRepo.save.mockResolvedValue(issue);
      issueRepo.findOne.mockResolvedValue(issue);

      await service.create(
        { ...createDto, assigneeId } as any,
        TEST_IDS.ORG_ID,
        TEST_IDS.USER_ID,
      );

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: assigneeId,
          type: 'issue:assigned',
        }),
      );
    });

    it('should not send notification when assignee is the reporter', async () => {
      const project = mockProject({ key: 'TPROJ' });
      projectsService.findById.mockResolvedValue(project);
      statusRepo.findOne.mockResolvedValue(mockIssueStatus());
      projectsService.getNextIssueNumber.mockResolvedValue(1);

      const issue = mockIssue({ assigneeId: TEST_IDS.USER_ID });
      issueRepo.create.mockReturnValue(issue);
      issueRepo.save.mockResolvedValue(issue);
      issueRepo.findOne.mockResolvedValue(issue);

      await service.create(
        { ...createDto, assigneeId: TEST_IDS.USER_ID } as any,
        TEST_IDS.ORG_ID,
        TEST_IDS.USER_ID,
      );

      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('should fall back to first status when no default status exists', async () => {
      const project = mockProject({ key: 'TPROJ' });
      projectsService.findById.mockResolvedValue(project);
      statusRepo.findOne
        .mockResolvedValueOnce(null) // no default
        .mockResolvedValueOnce(mockIssueStatus({ id: 'fallback-status', isDefault: false }));
      projectsService.getNextIssueNumber.mockResolvedValue(1);

      const issue = mockIssue();
      issueRepo.create.mockReturnValue(issue);
      issueRepo.save.mockResolvedValue(issue);
      issueRepo.findOne.mockResolvedValue(issue);

      await service.create(createDto as any, TEST_IDS.ORG_ID, TEST_IDS.USER_ID);

      expect(issueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ statusId: 'fallback-status' }),
      );
    });
  });

  describe('update', () => {
    it('should update issue fields and emit websocket event', async () => {
      const issue = mockIssue();
      const updatedIssue = mockIssue({ title: 'Updated Title' });
      issueRepo.findOne
        .mockResolvedValueOnce(issue) // findById in update
        .mockResolvedValueOnce(issue) // save re-fetch
        .mockResolvedValueOnce(updatedIssue); // findById for return
      issueRepo.save.mockResolvedValue(updatedIssue);

      const result = await service.update(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID, { title: 'Updated Title' }, TEST_IDS.USER_ID);

      expect(eventsGateway.emitToOrg).toHaveBeenCalledWith(TEST_IDS.ORG_ID, 'issue:updated', expect.anything());
    });

    it('should send notification when assignee changes to a different user', async () => {
      const issue = mockIssue({ assigneeId: 'old-assignee' });
      issueRepo.findOne
        .mockResolvedValueOnce(issue)
        .mockResolvedValueOnce(issue)
        .mockResolvedValueOnce(mockIssue({ assigneeId: 'new-assignee' }));
      issueRepo.save.mockResolvedValue(issue);

      await service.update(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID, { assigneeId: 'new-assignee' }, TEST_IDS.USER_ID);

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'new-assignee',
          type: 'issue:assigned',
        }),
      );
    });

    it('should not send notification when assignee is the updater', async () => {
      const issue = mockIssue({ assigneeId: 'old-assignee' });
      issueRepo.findOne
        .mockResolvedValueOnce(issue)
        .mockResolvedValueOnce(issue)
        .mockResolvedValueOnce(mockIssue({ assigneeId: TEST_IDS.USER_ID }));
      issueRepo.save.mockResolvedValue(issue);

      await service.update(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID, { assigneeId: TEST_IDS.USER_ID }, TEST_IDS.USER_ID);

      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('should set deletedAt timestamp and emit event', async () => {
      const issue = mockIssue();
      issueRepo.findOne.mockResolvedValue(issue);
      issueRepo.update.mockResolvedValue(mockUpdateResult());

      await service.softDelete(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID);

      expect(issueRepo.update).toHaveBeenCalledWith(TEST_IDS.ISSUE_ID, { deletedAt: expect.any(Date) });
      expect(eventsGateway.emitToOrg).toHaveBeenCalledWith(TEST_IDS.ORG_ID, 'issue:deleted', { id: TEST_IDS.ISSUE_ID });
    });

    it('should throw NotFoundException when issue not found', async () => {
      issueRepo.findOne.mockResolvedValue(null);

      await expect(service.softDelete('bad-id', TEST_IDS.ORG_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getChildren', () => {
    it('should return child issues', async () => {
      const children = [mockIssue({ parentId: TEST_IDS.ISSUE_ID, id: 'child-1' })];
      issueRepo.find.mockResolvedValue(children);

      const result = await service.getChildren(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID);

      expect(result).toEqual(children);
      expect(issueRepo.find).toHaveBeenCalledWith({
        where: { parentId: TEST_IDS.ISSUE_ID, organizationId: TEST_IDS.ORG_ID, deletedAt: expect.anything() },
        relations: ['status', 'assignee'],
        order: { position: 'ASC' },
      });
    });
  });

  describe('createWorkLog', () => {
    it('should create work log and update issue timeSpent', async () => {
      const issue = mockIssue({ timeSpent: 1800 });
      issueRepo.findOne.mockResolvedValue(issue);
      const workLog = mockWorkLog({ timeSpent: 3600 });
      workLogRepo.create.mockReturnValue(workLog);
      workLogRepo.save.mockResolvedValue(workLog);
      issueRepo.update.mockResolvedValue(mockUpdateResult());

      const result = await service.createWorkLog(
        TEST_IDS.ISSUE_ID,
        TEST_IDS.ORG_ID,
        { timeSpent: 3600, description: 'Worked on it' },
        TEST_IDS.USER_ID,
      );

      expect(result).toEqual(workLog);
      expect(issueRepo.update).toHaveBeenCalledWith(TEST_IDS.ISSUE_ID,
        expect.objectContaining({ timeSpent: 1800 + 3600 }),
      );
    });

    it('should handle null timeSpent on issue (treat as 0)', async () => {
      const issue = mockIssue({ timeSpent: 0 });
      // Simulate null by overriding
      (issue as any).timeSpent = null;
      issueRepo.findOne.mockResolvedValue(issue);
      const workLog = mockWorkLog({ timeSpent: 1000 });
      workLogRepo.create.mockReturnValue(workLog);
      workLogRepo.save.mockResolvedValue(workLog);
      issueRepo.update.mockResolvedValue(mockUpdateResult());

      await service.createWorkLog(
        TEST_IDS.ISSUE_ID,
        TEST_IDS.ORG_ID,
        { timeSpent: 1000 },
        TEST_IDS.USER_ID,
      );

      expect(issueRepo.update).toHaveBeenCalledWith(TEST_IDS.ISSUE_ID,
        expect.objectContaining({ timeSpent: 1000 }),
      );
    });

    it('should auto-reduce remaining estimate when timeEstimate is set (FR-TIME-006)', async () => {
      const issue = mockIssue({ timeSpent: 0, timeEstimate: 7200 });
      issueRepo.findOne.mockResolvedValue(issue);
      const workLog = mockWorkLog({ timeSpent: 3600 });
      workLogRepo.create.mockReturnValue(workLog);
      workLogRepo.save.mockResolvedValue(workLog);
      issueRepo.update.mockResolvedValue(mockUpdateResult());

      await service.createWorkLog(
        TEST_IDS.ISSUE_ID,
        TEST_IDS.ORG_ID,
        { timeSpent: 3600 },
        TEST_IDS.USER_ID,
      );

      expect(issueRepo.update).toHaveBeenCalledWith(TEST_IDS.ISSUE_ID, {
        timeSpent: 3600,
        timeEstimate: 3600, // 7200 - 3600
      });
    });

    it('should clamp remaining estimate to 0 when time spent exceeds estimate', async () => {
      const issue = mockIssue({ timeSpent: 0, timeEstimate: 1000 });
      issueRepo.findOne.mockResolvedValue(issue);
      const workLog = mockWorkLog({ timeSpent: 2000 });
      workLogRepo.create.mockReturnValue(workLog);
      workLogRepo.save.mockResolvedValue(workLog);
      issueRepo.update.mockResolvedValue(mockUpdateResult());

      await service.createWorkLog(
        TEST_IDS.ISSUE_ID,
        TEST_IDS.ORG_ID,
        { timeSpent: 2000 },
        TEST_IDS.USER_ID,
      );

      expect(issueRepo.update).toHaveBeenCalledWith(TEST_IDS.ISSUE_ID, {
        timeSpent: 2000,
        timeEstimate: 0,
      });
    });
  });

  describe('getWorkLogs', () => {
    it('should return work logs for an issue', async () => {
      const issue = mockIssue();
      issueRepo.findOne.mockResolvedValue(issue);
      const logs = [mockWorkLog()];
      workLogRepo.find.mockResolvedValue(logs);

      const result = await service.getWorkLogs(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID);

      expect(result).toEqual(logs);
      expect(workLogRepo.find).toHaveBeenCalledWith({
        where: { issueId: TEST_IDS.ISSUE_ID },
        relations: ['user'],
        order: { loggedAt: 'DESC' },
      });
    });
  });
});
