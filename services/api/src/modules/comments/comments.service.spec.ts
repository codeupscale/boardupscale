import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommentsService } from './comments.service';
import { Comment } from './entities/comment.entity';
import { Issue } from '../issues/entities/issue.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { UsersService } from '../users/users.service';
import { EventsGateway } from '../../websocket/events.gateway';
import { WebhookEventEmitter } from '../webhooks/webhook-event-emitter.service';
import { AutomationEngineService } from '../automation/automation-engine.service';
import {
  createMockRepository,
  createMockNotificationsService,
  createMockEventsGateway,
  createMockConfigService,
  mockUpdateResult,
} from '../../test/test-utils';
import { mockComment, mockIssue, mockUser, TEST_IDS } from '../../test/mock-factories';

describe('CommentsService', () => {
  let service: CommentsService;
  let commentRepo: ReturnType<typeof createMockRepository>;
  let issueRepo: ReturnType<typeof createMockRepository>;
  let notificationsService: ReturnType<typeof createMockNotificationsService>;
  let eventsGateway: ReturnType<typeof createMockEventsGateway>;
  let emailService: Record<string, jest.Mock>;
  let usersService: Record<string, jest.Mock>;

  beforeEach(async () => {
    commentRepo = createMockRepository();
    issueRepo = createMockRepository();
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
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: commentRepo },
        { provide: getRepositoryToken(Issue), useValue: issueRepo },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: EmailService, useValue: emailService },
        { provide: UsersService, useValue: usersService },
        { provide: ConfigService, useValue: createMockConfigService({ 'app.frontendUrl': 'http://localhost:3000' }) },
        { provide: EventsGateway, useValue: eventsGateway },
        { provide: WebhookEventEmitter, useValue: { emit: jest.fn().mockResolvedValue(undefined) } },
        { provide: AutomationEngineService, useValue: { processTrigger: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return comments for an issue ordered by creation date', async () => {
      const comments = [mockComment()];
      commentRepo.find.mockResolvedValue(comments);

      const result = await service.findAll(TEST_IDS.ISSUE_ID);

      expect(result).toEqual(comments);
      expect(commentRepo.find).toHaveBeenCalledWith({
        where: { issueId: TEST_IDS.ISSUE_ID, deletedAt: expect.anything() },
        relations: ['author'],
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('create', () => {
    it('should create a comment on an issue', async () => {
      const issue = mockIssue({ reporterId: 'reporter-id', assigneeId: null });
      issueRepo.findOne.mockResolvedValue(issue);

      const comment = mockComment({ content: 'New comment' });
      commentRepo.create.mockReturnValue(comment);
      commentRepo.save.mockResolvedValue(comment);
      const fullComment = { ...comment, author: { id: TEST_IDS.USER_ID, displayName: 'Test User' } };
      commentRepo.findOne.mockResolvedValue(fullComment);

      const result = await service.create(
        { issueId: TEST_IDS.ISSUE_ID, content: 'New comment' },
        TEST_IDS.USER_ID,
        TEST_IDS.ORG_ID,
      );

      expect(result).toEqual(fullComment);
      expect(eventsGateway.emitToOrg).toHaveBeenCalledWith(
        TEST_IDS.ORG_ID,
        'comment:created',
        expect.objectContaining({ issueId: TEST_IDS.ISSUE_ID }),
      );
    });

    it('should throw NotFoundException when issue not found', async () => {
      issueRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create(
          { issueId: 'bad-id', content: 'test' },
          TEST_IDS.USER_ID,
          TEST_IDS.ORG_ID,
        ),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.create(
          { issueId: 'bad-id', content: 'test' },
          TEST_IDS.USER_ID,
          TEST_IDS.ORG_ID,
        ),
      ).rejects.toThrow('Issue not found');
    });

    it('should notify reporter when comment is from a different user', async () => {
      const issue = mockIssue({ reporterId: 'reporter-id', assigneeId: null, key: 'TPROJ-1' });
      issueRepo.findOne.mockResolvedValue(issue);
      const comment = mockComment();
      commentRepo.create.mockReturnValue(comment);
      commentRepo.save.mockResolvedValue(comment);
      commentRepo.findOne.mockResolvedValue(comment);

      await service.create(
        { issueId: TEST_IDS.ISSUE_ID, content: 'New comment' },
        TEST_IDS.USER_ID,
        TEST_IDS.ORG_ID,
      );

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'reporter-id',
          type: 'comment:created',
          title: 'New comment on TPROJ-1',
        }),
      );
    });

    it('should not notify reporter when comment author is the reporter', async () => {
      const issue = mockIssue({ reporterId: TEST_IDS.USER_ID, assigneeId: null });
      issueRepo.findOne.mockResolvedValue(issue);
      const comment = mockComment();
      commentRepo.create.mockReturnValue(comment);
      commentRepo.save.mockResolvedValue(comment);
      commentRepo.findOne.mockResolvedValue(comment);

      await service.create(
        { issueId: TEST_IDS.ISSUE_ID, content: 'My own comment' },
        TEST_IDS.USER_ID,
        TEST_IDS.ORG_ID,
      );

      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('should notify assignee when different from author and reporter', async () => {
      const issue = mockIssue({
        reporterId: 'reporter-id',
        assigneeId: 'assignee-id',
        key: 'TPROJ-1',
      });
      issueRepo.findOne.mockResolvedValue(issue);
      const comment = mockComment();
      commentRepo.create.mockReturnValue(comment);
      commentRepo.save.mockResolvedValue(comment);
      commentRepo.findOne.mockResolvedValue(comment);

      await service.create(
        { issueId: TEST_IDS.ISSUE_ID, content: 'Comment text' },
        TEST_IDS.USER_ID,
        TEST_IDS.ORG_ID,
      );

      // Should notify both reporter and assignee
      expect(notificationsService.create).toHaveBeenCalledTimes(2);
    });

    it('should not double-notify when assignee is the same as reporter', async () => {
      const issue = mockIssue({
        reporterId: 'same-person',
        assigneeId: 'same-person',
      });
      issueRepo.findOne.mockResolvedValue(issue);
      const comment = mockComment();
      commentRepo.create.mockReturnValue(comment);
      commentRepo.save.mockResolvedValue(comment);
      commentRepo.findOne.mockResolvedValue(comment);

      await service.create(
        { issueId: TEST_IDS.ISSUE_ID, content: 'Comment text' },
        TEST_IDS.USER_ID,
        TEST_IDS.ORG_ID,
      );

      // Should only notify once (reporter), not the assignee since they are the same
      expect(notificationsService.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    it('should update own comment', async () => {
      const comment = mockComment({ authorId: TEST_IDS.USER_ID });
      commentRepo.findOne.mockResolvedValue(comment);
      const updated = { ...comment, content: 'Updated content', editedAt: new Date() };
      commentRepo.save.mockResolvedValue(updated);

      const result = await service.update(TEST_IDS.COMMENT_ID, TEST_IDS.USER_ID, {
        content: 'Updated content',
      });

      expect(result.content).toBe('Updated content');
      expect(commentRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when comment not found', async () => {
      commentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update('bad-id', TEST_IDS.USER_ID, { content: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when updating another users comment', async () => {
      const comment = mockComment({ authorId: 'other-user-id' });
      commentRepo.findOne.mockResolvedValue(comment);

      await expect(
        service.update(TEST_IDS.COMMENT_ID, TEST_IDS.USER_ID, { content: 'hacked' }),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update(TEST_IDS.COMMENT_ID, TEST_IDS.USER_ID, { content: 'hacked' }),
      ).rejects.toThrow('You can only edit your own comments');
    });
  });

  describe('delete', () => {
    it('should soft delete own comment', async () => {
      const comment = mockComment({ authorId: TEST_IDS.USER_ID });
      commentRepo.findOne.mockResolvedValue(comment);
      commentRepo.update.mockResolvedValue(mockUpdateResult());

      await service.delete(TEST_IDS.COMMENT_ID, TEST_IDS.USER_ID);

      expect(commentRepo.update).toHaveBeenCalledWith(TEST_IDS.COMMENT_ID, {
        deletedAt: expect.any(Date),
      });
    });

    it('should throw NotFoundException when comment not found', async () => {
      commentRepo.findOne.mockResolvedValue(null);

      await expect(service.delete('bad-id', TEST_IDS.USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when deleting another users comment', async () => {
      const comment = mockComment({ authorId: 'other-user-id' });
      commentRepo.findOne.mockResolvedValue(comment);

      await expect(service.delete(TEST_IDS.COMMENT_ID, TEST_IDS.USER_ID)).rejects.toThrow(ForbiddenException);
      await expect(service.delete(TEST_IDS.COMMENT_ID, TEST_IDS.USER_ID)).rejects.toThrow(
        'You can only delete your own comments',
      );
    });
  });
});
