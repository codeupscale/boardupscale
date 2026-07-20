import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { EventsGateway } from '../../websocket/events.gateway';
import { createMockRepository, createMockQueryBuilder } from '../../test/test-utils';
import { mockNotification, TEST_IDS } from '../../test/mock-factories';
import { NOTIFICATION_QUEUE } from './notification.constants';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationRepo: ReturnType<typeof createMockRepository>;
  let usersRepo: ReturnType<typeof createMockRepository>;
  let notificationQueue: { add: jest.Mock };

  beforeEach(async () => {
    notificationRepo = createMockRepository();
    usersRepo = createMockRepository();
    notificationQueue = { add: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: notificationRepo },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getQueueToken(NOTIFICATION_QUEUE), useValue: notificationQueue },
        {
          provide: EventsGateway,
          useValue: { emitToUser: jest.fn(), emitToOrg: jest.fn(), emitToProject: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create and return a notification', async () => {
      const notification = mockNotification();
      notificationRepo.create.mockReturnValue(notification);
      notificationRepo.save.mockResolvedValue(notification);
      notificationRepo.count.mockResolvedValue(1);

      const result = await service.create({
        organizationId: TEST_IDS.ORG_ID,
        userId: TEST_IDS.USER_ID,
        type: 'issue:assigned',
        title: 'You have been assigned to TPROJ-1',
        body: 'Test Issue',
        data: { issueId: TEST_IDS.ISSUE_ID, projectId: TEST_IDS.PROJECT_ID },
      });

      expect(result).toEqual(notification);
      expect(notificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: TEST_IDS.ORG_ID,
          userId: TEST_IDS.USER_ID,
          type: 'issue:assigned',
        }),
      );
    });
  });

  describe('notify', () => {
    it('should never notify the actor by default', async () => {
      await service.notify({
        organizationId: TEST_IDS.ORG_ID,
        actorUserId: TEST_IDS.USER_ID,
        type: 'issue:status_changed',
        title: 'moved',
        recipientUserIds: [TEST_IDS.USER_ID],
      });

      expect(notificationRepo.create).not.toHaveBeenCalled();
      expect(notificationQueue.add).not.toHaveBeenCalled();
    });

    it('should notify the actor when includeActor is true', async () => {
      usersRepo.find.mockResolvedValue([
        {
          id: TEST_IDS.USER_ID,
          notificationPreferences: { inApp: true, sound: true, email: true },
        },
      ]);
      const notification = mockNotification();
      notificationRepo.create.mockReturnValue(notification);
      notificationRepo.save.mockResolvedValue(notification);
      notificationRepo.count.mockResolvedValue(1);

      await service.notify({
        organizationId: TEST_IDS.ORG_ID,
        actorUserId: TEST_IDS.USER_ID,
        type: 'issue:created',
        title: 'created',
        recipientUserIds: [TEST_IDS.USER_ID],
        includeActor: true,
      });

      expect(notificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_IDS.USER_ID,
          type: 'issue:created',
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated notifications scoped to org', async () => {
      const notifications = [mockNotification()];
      const qb = createMockQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([notifications, 1]);
      notificationRepo.createQueryBuilder.mockReturnValue(qb);
      notificationRepo.count.mockResolvedValue(1);

      const result = await service.findAll(TEST_IDS.USER_ID, TEST_IDS.ORG_ID, 1, 20);

      expect(result).toEqual({
        items: notifications,
        total: 1,
        page: 1,
        limit: 20,
        unreadCount: 1,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('n.organization_id = :organizationId', {
        organizationId: TEST_IDS.ORG_ID,
      });
    });
  });

  describe('getUnreadCount', () => {
    it('should return count of unread notifications for org', async () => {
      notificationRepo.count.mockResolvedValue(5);

      const result = await service.getUnreadCount(TEST_IDS.USER_ID, TEST_IDS.ORG_ID);

      expect(result).toBe(5);
      expect(notificationRepo.count).toHaveBeenCalledWith({
        where: {
          userId: TEST_IDS.USER_ID,
          organizationId: TEST_IDS.ORG_ID,
          readAt: IsNull(),
        },
      });
    });
  });

  describe('markRead', () => {
    it('should mark a notification as read', async () => {
      const notification = { ...mockNotification(), readAt: null };
      notificationRepo.findOne.mockResolvedValue(notification);
      const readNotification = { ...notification, readAt: new Date() };
      notificationRepo.save.mockResolvedValue(readNotification);
      notificationRepo.count.mockResolvedValue(0);

      const result = await service.markRead(
        TEST_IDS.NOTIFICATION_ID,
        TEST_IDS.USER_ID,
        TEST_IDS.ORG_ID,
      );

      expect(result.readAt).toBeTruthy();
      expect(notificationRepo.findOne).toHaveBeenCalledWith({
        where: {
          id: TEST_IDS.NOTIFICATION_ID,
          userId: TEST_IDS.USER_ID,
          organizationId: TEST_IDS.ORG_ID,
        },
      });
    });

    it('should throw NotFoundException when notification not found', async () => {
      notificationRepo.findOne.mockResolvedValue(null);

      await expect(
        service.markRead('bad-id', TEST_IDS.USER_ID, TEST_IDS.ORG_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllRead', () => {
    it('should mark all unread notifications as read for org', async () => {
      const qb = createMockQueryBuilder();
      qb.execute.mockResolvedValue({ affected: 3 });
      notificationRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.markAllRead(TEST_IDS.USER_ID, TEST_IDS.ORG_ID);

      expect(result).toEqual({ affected: 3 });
      expect(qb.where).toHaveBeenCalledWith(
        'user_id = :userId AND organization_id = :organizationId AND read_at IS NULL',
        { userId: TEST_IDS.USER_ID, organizationId: TEST_IDS.ORG_ID },
      );
    });
  });
});
