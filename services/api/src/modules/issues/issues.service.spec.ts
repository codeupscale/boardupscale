import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IssuesService } from './issues.service';
import { Issue } from './entities/issue.entity';
import { IssueStatus } from './entities/issue-status.entity';
import { WorkLog } from './entities/work-log.entity';
import { IssueLink } from './entities/issue-link.entity';
import { IssueWatcher } from './entities/issue-watcher.entity';
import { ActivityService } from '../activity/activity.service';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
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
  let issueLinkRepo: ReturnType<typeof createMockRepository>;
  let projectsService: ReturnType<typeof createMockProjectsService>;
  let notificationsService: ReturnType<typeof createMockNotificationsService>;
  let eventsGateway: ReturnType<typeof createMockEventsGateway>;
  let permissionsService: Record<string, jest.Mock>;
  let emailService: Record<string, jest.Mock>;
  let usersService: Record<string, jest.Mock>;

  beforeEach(async () => {
    issueRepo = createMockRepository();
    statusRepo = createMockRepository();
    workLogRepo = createMockRepository();
    issueLinkRepo = createMockRepository();
    projectsService = createMockProjectsService();
    projectsService.isMember.mockResolvedValue(true);
    notificationsService = createMockNotificationsService();
    eventsGateway = createMockEventsGateway();
    permissionsService = {
      isAdminOrOwner: jest.fn().mockResolvedValue(false),
      checkPermission: jest.fn().mockResolvedValue(false),
    };
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
        { provide: getRepositoryToken(IssueLink), useValue: issueLinkRepo },
        { provide: getRepositoryToken(IssueWatcher), useValue: createMockRepository() },
        { provide: ProjectsService, useValue: projectsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: EmailService, useValue: emailService },
        { provide: UsersService, useValue: usersService },
        { provide: ConfigService, useValue: createMockConfigService({ 'app.frontendUrl': 'http://localhost:3000' }) },
        { provide: EventsGateway, useValue: eventsGateway },
        { provide: WebhookEventEmitter, useValue: { emit: jest.fn().mockResolvedValue(undefined) } },
        { provide: getQueueToken('search-index'), useValue: { add: jest.fn().mockResolvedValue(undefined) } },
        { provide: AutomationEngineService, useValue: { processTrigger: jest.fn().mockResolvedValue(undefined) } },
        { provide: ActivityService, useValue: { log: jest.fn().mockResolvedValue(undefined), findByIssue: jest.fn().mockResolvedValue({ data: [], total: 0 }) } },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        { provide: PermissionsService, useValue: permissionsService },
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

    it('should apply parentless filter (parent_id IS NULL) when set to true', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getCount.mockResolvedValue(0);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({
        organizationId: TEST_IDS.ORG_ID,
        parentless: true,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('issue.parent_id IS NULL');
    });

    it('should NOT apply parentless filter when false or omitted', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getCount.mockResolvedValue(0);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({
        organizationId: TEST_IDS.ORG_ID,
        parentless: false,
      });

      expect(qb.andWhere).not.toHaveBeenCalledWith('issue.parent_id IS NULL');
    });

    it('should apply parentId filter when set', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getCount.mockResolvedValue(0);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({
        organizationId: TEST_IDS.ORG_ID,
        parentId: TEST_IDS.ISSUE_ID,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('issue.parent_id = :parentId', {
        parentId: TEST_IDS.ISSUE_ID,
      });
    });

    it('should apply excludeTypes with a single value', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getCount.mockResolvedValue(0);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({
        organizationId: TEST_IDS.ORG_ID,
        excludeTypes: 'subtask',
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'issue.type NOT IN (:...excludeTypeList)',
        { excludeTypeList: ['subtask'] },
      );
    });

    it('should apply excludeTypes with multiple comma-separated values', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getCount.mockResolvedValue(0);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({
        organizationId: TEST_IDS.ORG_ID,
        excludeTypes: 'epic,subtask',
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'issue.type NOT IN (:...excludeTypeList)',
        { excludeTypeList: ['epic', 'subtask'] },
      );
    });

    it('should trim whitespace and drop empty entries in excludeTypes', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getCount.mockResolvedValue(0);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({
        organizationId: TEST_IDS.ORG_ID,
        excludeTypes: ' epic , , subtask ',
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'issue.type NOT IN (:...excludeTypeList)',
        { excludeTypeList: ['epic', 'subtask'] },
      );
    });

    it('should NOT add NOT IN clause when excludeTypes is an empty string', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getCount.mockResolvedValue(0);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({
        organizationId: TEST_IDS.ORG_ID,
        excludeTypes: '',
      });

      // No NOT IN clause should have been added when the input is empty.
      const calls = qb.andWhere.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).not.toContain('issue.type NOT IN (:...excludeTypeList)');
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
        relations: ['status', 'assignee', 'reporter', 'sprint', 'parent', 'parent.parent', 'parent.parent.parent', 'project'],
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

      const minQb = createMockQueryBuilder();
      minQb.getRawOne.mockResolvedValue({ min: null });
      issueRepo.createQueryBuilder.mockReturnValue(minQb);

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
          position: 0,
          sprintId: null,
          organizationId: TEST_IDS.ORG_ID,
          reporterId: TEST_IDS.USER_ID,
          statusId: defaultStatus.id,
        }),
      );
      expect(eventsGateway.emitToOrg).toHaveBeenCalledWith(TEST_IDS.ORG_ID, 'issue:created', fullIssue);
    });

    it('should place new issue at top of board column and sprint/backlog bucket', async () => {
      const project = mockProject({ key: 'TPROJ' });
      projectsService.findById.mockResolvedValue(project);
      statusRepo.findOne.mockResolvedValue(mockIssueStatus({ id: 'status-1' }));
      projectsService.getNextIssueNumber.mockResolvedValue(10);

      const statusMinQb = createMockQueryBuilder();
      statusMinQb.getRawOne.mockResolvedValue({ min: '5' });
      const sprintMinQb = createMockQueryBuilder();
      sprintMinQb.getRawOne.mockResolvedValue({ min: '2' });
      issueRepo.createQueryBuilder
        .mockReturnValueOnce(statusMinQb)
        .mockReturnValueOnce(sprintMinQb);

      const issue = mockIssue({ key: 'TPROJ-10', number: 10 });
      issueRepo.create.mockReturnValue(issue);
      issueRepo.save.mockResolvedValue(issue);
      issueRepo.findOne.mockResolvedValue(issue);

      await service.create(
        { ...createDto, sprintId: 'sprint-1' } as any,
        TEST_IDS.ORG_ID,
        TEST_IDS.USER_ID,
      );

      expect(issueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sprintId: 'sprint-1',
          position: 1,
        }),
      );
    });

    it('should send notification when assignee is different from reporter', async () => {
      const project = mockProject({ key: 'TPROJ' });
      projectsService.findById.mockResolvedValue(project);
      statusRepo.findOne.mockResolvedValue(mockIssueStatus());
      projectsService.getNextIssueNumber.mockResolvedValue(1);

      const minQb = createMockQueryBuilder();
      minQb.getRawOne.mockResolvedValue({ min: null });
      issueRepo.createQueryBuilder.mockReturnValue(minQb);

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

      const minQb = createMockQueryBuilder();
      minQb.getRawOne.mockResolvedValue({ min: null });
      issueRepo.createQueryBuilder.mockReturnValue(minQb);

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

      const minQb = createMockQueryBuilder();
      minQb.getRawOne.mockResolvedValue({ min: null });
      issueRepo.createQueryBuilder.mockReturnValue(minQb);

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

    // ─────────────────────────────────────────────────────────────────────────
    //  Parent-id update path — hierarchy validation, same-project, self-parent
    // ─────────────────────────────────────────────────────────────────────────

    it('should accept a valid parent (Epic → Story) on update', async () => {
      const story = mockIssue({ id: 'story-1', type: 'story', projectId: 'proj-1' });
      const epic = mockIssue({ id: 'epic-1', type: 'epic', projectId: 'proj-1' });
      issueRepo.findOne
        .mockResolvedValueOnce(story) // findById (load child)
        .mockResolvedValueOnce(epic) // parent lookup
        .mockResolvedValueOnce(mockIssue({ id: 'story-1', parentId: 'epic-1' })); // refetch
      issueRepo.save.mockResolvedValue(story);

      await expect(
        service.update('story-1', TEST_IDS.ORG_ID, { parentId: 'epic-1' }, TEST_IDS.USER_ID),
      ).resolves.toBeDefined();

      expect(issueRepo.save).toHaveBeenCalled();
    });

    it('should accept Story → Subtask parent on update', async () => {
      const subtask = mockIssue({ id: 'sub-1', type: 'subtask', projectId: 'proj-1' });
      const story = mockIssue({ id: 'story-1', type: 'story', projectId: 'proj-1' });
      issueRepo.findOne
        .mockResolvedValueOnce(subtask)
        .mockResolvedValueOnce(story)
        .mockResolvedValueOnce(mockIssue({ id: 'sub-1', parentId: 'story-1' }));
      issueRepo.save.mockResolvedValue(subtask);

      await expect(
        service.update('sub-1', TEST_IDS.ORG_ID, { parentId: 'story-1' }, TEST_IDS.USER_ID),
      ).resolves.toBeDefined();

      expect(issueRepo.save).toHaveBeenCalled();
    });

    it('should reject self-parenting before any DB lookup', async () => {
      const issue = mockIssue({ id: 'iss-1', type: 'task' });
      issueRepo.findOne.mockResolvedValueOnce(issue);

      // Share one promise across both expects so the mock queue is consumed once.
      const promise = service.update('iss-1', TEST_IDS.ORG_ID, { parentId: 'iss-1' }, TEST_IDS.USER_ID);
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toThrow('An issue cannot be its own parent');
    });

    it('should reject when the parent does not exist in the org', async () => {
      const issue = mockIssue({ id: 'iss-1', type: 'task', projectId: 'proj-1' });
      issueRepo.findOne
        .mockResolvedValueOnce(issue) // load child
        .mockResolvedValueOnce(null); // parent lookup returns nothing

      await expect(
        service.update('iss-1', TEST_IDS.ORG_ID, { parentId: 'ghost' }, TEST_IDS.USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject parent in a different project', async () => {
      const taskInProjA = mockIssue({ id: 'task-1', type: 'task', projectId: 'proj-A' });
      const epicInProjB = mockIssue({ id: 'epic-1', type: 'epic', projectId: 'proj-B' });
      issueRepo.findOne
        .mockResolvedValueOnce(taskInProjA)
        .mockResolvedValueOnce(epicInProjB);

      const promise = service.update('task-1', TEST_IDS.ORG_ID, { parentId: 'epic-1' }, TEST_IDS.USER_ID);
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toThrow('Parent issue must be in the same project');
    });

    it('should reject invalid hierarchy (Story cannot parent a Task)', async () => {
      // Under the current rule Story can only parent Subtask.
      const task = mockIssue({ id: 'task-1', type: 'task', projectId: 'proj-1' });
      const story = mockIssue({ id: 'story-1', type: 'story', projectId: 'proj-1' });
      issueRepo.findOne
        .mockResolvedValueOnce(task)
        .mockResolvedValueOnce(story);

      await expect(
        service.update('task-1', TEST_IDS.ORG_ID, { parentId: 'story-1' }, TEST_IDS.USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid hierarchy (Subtask cannot parent anything)', async () => {
      const story = mockIssue({ id: 'story-1', type: 'story', projectId: 'proj-1' });
      const subtask = mockIssue({ id: 'sub-1', type: 'subtask', projectId: 'proj-1' });
      issueRepo.findOne
        .mockResolvedValueOnce(story)
        .mockResolvedValueOnce(subtask);

      const promise = service.update('story-1', TEST_IDS.ORG_ID, { parentId: 'sub-1' }, TEST_IDS.USER_ID);
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toThrow(/cannot have child issues/i);
    });

    it('should allow clearing parent (parentId=null) without validation', async () => {
      const subtask = mockIssue({ id: 'sub-1', type: 'subtask', parentId: 'story-1' });
      issueRepo.findOne
        .mockResolvedValueOnce(subtask)
        .mockResolvedValueOnce(mockIssue({ id: 'sub-1', parentId: null }));
      issueRepo.save.mockResolvedValue(subtask);

      await expect(
        service.update('sub-1', TEST_IDS.ORG_ID, { parentId: null }, TEST_IDS.USER_ID),
      ).resolves.toBeDefined();

      // The parent-lookup findOne must NOT have been called when clearing.
      // (1 call for findById, 1 for refetch — total 2; would be 3 if validation ran.)
      expect(issueRepo.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('softDelete', () => {
    it('should set deletedAt timestamp and emit event when reporter deletes own issue', async () => {
      const issue = mockIssue({ reporterId: TEST_IDS.USER_ID });
      issueRepo.findOne.mockResolvedValue(issue);
      issueRepo.update.mockResolvedValue(mockUpdateResult());

      await service.softDelete(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID, TEST_IDS.USER_ID);

      expect(issueRepo.update).toHaveBeenCalledWith(TEST_IDS.ISSUE_ID, { deletedAt: expect.any(Date) });
      expect(eventsGateway.emitToOrg).toHaveBeenCalledWith(TEST_IDS.ORG_ID, 'issue:deleted', { id: TEST_IDS.ISSUE_ID });
    });

    it('should allow admin to delete any issue (own-only bypass)', async () => {
      const issue = mockIssue({ reporterId: 'someone-else' });
      issueRepo.findOne.mockResolvedValue(issue);
      issueRepo.update.mockResolvedValue(mockUpdateResult());
      permissionsService.isAdminOrOwner.mockResolvedValue(true);

      await expect(
        service.softDelete(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID, TEST_IDS.USER_ID),
      ).resolves.not.toThrow();
    });

    it('should throw ForbiddenException when Member tries to delete another user\'s issue', async () => {
      const issue = mockIssue({ reporterId: 'another-user-id' });
      issueRepo.findOne.mockResolvedValue(issue);
      permissionsService.isAdminOrOwner.mockResolvedValue(false);

      await expect(
        service.softDelete(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID, TEST_IDS.USER_ID),
      ).rejects.toThrow(ForbiddenException);
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

  describe('issue links', () => {
    it('getLinks should return outward and inward links with labels', async () => {
      const sourceIssue = mockIssue({ id: TEST_IDS.ISSUE_ID });
      const targetIssue = mockIssue({ id: 'target-1', key: 'PROJ-2' });
      const inwardSource = mockIssue({ id: 'source-1', key: 'PROJ-3' });

      issueRepo.findOne.mockResolvedValue(sourceIssue);
      issueLinkRepo.find
        .mockResolvedValueOnce([
          {
            id: 'link-out',
            linkType: 'blocks',
            targetIssue,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'link-in',
            linkType: 'blocks',
            sourceIssue: inwardSource,
          },
        ]);

      const result = await service.getLinks(TEST_IDS.ISSUE_ID, TEST_IDS.ORG_ID);

      expect(result.outward).toHaveLength(1);
      expect(result.outward[0]).toMatchObject({
        id: 'link-out',
        linkType: 'blocks',
        label: 'blocks',
        issue: targetIssue,
      });
      expect(result.inward).toHaveLength(1);
      expect(result.inward[0]).toMatchObject({
        id: 'link-in',
        linkType: 'is_blocked_by',
        label: 'is blocked by',
        issue: inwardSource,
      });
    });

    it('createLink should persist link between two issues', async () => {
      const source = mockIssue({ id: TEST_IDS.ISSUE_ID });
      const target = mockIssue({ id: 'target-1' });
      const savedLink = {
        id: 'link-1',
        sourceIssueId: TEST_IDS.ISSUE_ID,
        targetIssueId: 'target-1',
        linkType: 'relates_to',
      };

      issueRepo.findOne
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);
      issueLinkRepo.create.mockReturnValue(savedLink);
      issueLinkRepo.save.mockResolvedValue(savedLink);
      issueLinkRepo.findOne.mockResolvedValue({
        ...savedLink,
        sourceIssue: source,
        targetIssue: target,
      });

      const result = await service.createLink(
        TEST_IDS.ISSUE_ID,
        TEST_IDS.ORG_ID,
        { targetIssueId: 'target-1', linkType: 'relates_to' },
        TEST_IDS.USER_ID,
      );

      expect(issueLinkRepo.create).toHaveBeenCalledWith({
        sourceIssueId: TEST_IDS.ISSUE_ID,
        targetIssueId: 'target-1',
        linkType: 'relates_to',
        createdBy: TEST_IDS.USER_ID,
      });
      expect(result).toMatchObject({ id: 'link-1' });
    });

    it('createLink should reject self-links', async () => {
      const issue = mockIssue({ id: TEST_IDS.ISSUE_ID });
      issueRepo.findOne.mockResolvedValue(issue);

      await expect(
        service.createLink(
          TEST_IDS.ISSUE_ID,
          TEST_IDS.ORG_ID,
          { targetIssueId: TEST_IDS.ISSUE_ID, linkType: 'relates_to' },
          TEST_IDS.USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('deleteLink should remove link scoped to issue', async () => {
      const issue = mockIssue({ id: TEST_IDS.ISSUE_ID });
      issueRepo.findOne.mockResolvedValue(issue);
      issueLinkRepo.findOne.mockResolvedValue({
        id: 'link-1',
        sourceIssueId: TEST_IDS.ISSUE_ID,
        targetIssueId: 'target-1',
      });
      issueLinkRepo.delete.mockResolvedValue(undefined);

      await service.deleteLink(TEST_IDS.ISSUE_ID, 'link-1', TEST_IDS.ORG_ID);

      expect(issueLinkRepo.delete).toHaveBeenCalledWith('link-1');
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

  describe('bulkDelete', () => {
    const dto = { issueIds: [TEST_IDS.ISSUE_ID, '55555555-5555-5555-5555-000000000000'] };

    it('should throw BadRequestException when issueIds is empty', async () => {
      await expect(
        service.bulkDelete(TEST_IDS.ORG_ID, { issueIds: [] }, TEST_IDS.USER_ID),
      ).rejects.toThrow('issueIds must not be empty');
    });

    it('should delete any issue when caller has issue:delete permission', async () => {
      permissionsService.checkPermission.mockResolvedValue(true);
      const qb = createMockQueryBuilder([]);
      qb.execute.mockResolvedValue({ affected: 2 });
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.bulkDelete(TEST_IDS.ORG_ID, dto, TEST_IDS.USER_ID);

      expect(result).toEqual({ affected: 2 });
      // No reporter_id filter when admin
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        'reporter_id = :callerId',
        expect.anything(),
      );
      expect(eventsGateway.emitToOrg).toHaveBeenCalledWith(
        TEST_IDS.ORG_ID,
        'issues:bulk-deleted',
        { issueIds: dto.issueIds },
      );
    });

    it('should restrict to own issues when caller lacks issue:delete permission', async () => {
      permissionsService.checkPermission.mockResolvedValue(false);
      const qb = createMockQueryBuilder([]);
      qb.execute.mockResolvedValue({ affected: 1 });
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.bulkDelete(TEST_IDS.ORG_ID, dto, TEST_IDS.USER_ID);

      expect(result).toEqual({ affected: 1 });
      // Must apply reporter_id filter for non-admins (P27)
      expect(qb.andWhere).toHaveBeenCalledWith('reporter_id = :callerId', {
        callerId: TEST_IDS.USER_ID,
      });
    });
  });
});
