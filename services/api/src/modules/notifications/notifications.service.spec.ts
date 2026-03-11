import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';
import { EventsGateway } from '../../websocket/events.gateway';
import { createMockRepository, createMockQueryBuilder } from '../../test/test-utils';
import { mockNotification, TEST_IDS } from '../../test/mock-factories';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationRepo: ReturnType<typeof createMockRepository>;

  beforeEach(async () => {
    notificationRepo = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: notificationRepo },
        { provide: EventsGateway, useValue: { emitToUser: jest.fn(), emitToOrg: jest.fn(), emitToProject: jest.fn() } },
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

      const result = await service.create({
        userId: TEST_IDS.USER_ID,
        type: 'issue:assigned',
        title: 'You have been assigned to TPROJ-1',
        body: 'Test Issue',
        data: { issueId: TEST_IDS.ISSUE_ID, projectId: TEST_IDS.PROJECT_ID },
      });

      expect(result).toEqual(notification);
      expect(notificationRepo.create).toHaveBeenCalledWith({
        userId: TEST_IDS.USER_ID,
        type: 'issue:assigned',
        title: 'You have been assigned to TPROJ-1',
        body: 'Test Issue',
        data: { issueId: TEST_IDS.ISSUE_ID, projectId: TEST_IDS.PROJECT_ID },
      });
    });
  });

  describe('findAll', () => {
    it('should return paginated notifications for user', async () => {
      const notifications = [mockNotification()];
      notificationRepo.findAndCount.mockResolvedValue([notifications, 1]);

      const result = await service.findAll(TEST_IDS.USER_ID, 1, 20);

      expect(result).toEqual({ items: notifications, total: 1, page: 1, limit: 20 });
      expect(notificationRepo.findAndCount).toHaveBeenCalledWith({
        where: { userId: TEST_IDS.USER_ID },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
    });

    it('should use default pagination when not specified', async () => {
      notificationRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll(TEST_IDS.USER_ID);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should calculate correct skip value for page 3', async () => {
      notificationRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(TEST_IDS.USER_ID, 3, 10);

      expect(notificationRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('getUnreadCount', () => {
    it('should return count of unread notifications', async () => {
      notificationRepo.count.mockResolvedValue(5);

      const result = await service.getUnreadCount(TEST_IDS.USER_ID);

      expect(result).toBe(5);
      expect(notificationRepo.count).toHaveBeenCalledWith({
        where: { userId: TEST_IDS.USER_ID, readAt: null },
      });
    });
  });

  describe('markRead', () => {
    it('should mark a notification as read', async () => {
      const notification = mockNotification();
      notificationRepo.findOne.mockResolvedValue(notification);
      const readNotification = { ...notification, readAt: new Date() };
      notificationRepo.save.mockResolvedValue(readNotification);

      const result = await service.markRead(TEST_IDS.NOTIFICATION_ID, TEST_IDS.USER_ID);

      expect(result.readAt).toBeTruthy();
      expect(notificationRepo.findOne).toHaveBeenCalledWith({
        where: { id: TEST_IDS.NOTIFICATION_ID, userId: TEST_IDS.USER_ID },
      });
    });

    it('should throw NotFoundException when notification not found', async () => {
      notificationRepo.findOne.mockResolvedValue(null);

      await expect(
        service.markRead('bad-id', TEST_IDS.USER_ID),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.markRead('bad-id', TEST_IDS.USER_ID),
      ).rejects.toThrow('Notification not found');
    });

    it('should not allow reading another users notification', async () => {
      notificationRepo.findOne.mockResolvedValue(null); // Not found for this userId

      await expect(
        service.markRead(TEST_IDS.NOTIFICATION_ID, 'other-user'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllRead', () => {
    it('should mark all unread notifications as read', async () => {
      const qb = createMockQueryBuilder();
      notificationRepo.createQueryBuilder.mockReturnValue(qb);

      await service.markAllRead(TEST_IDS.USER_ID);

      expect(qb.set).toHaveBeenCalledWith({ readAt: expect.any(Date) });
      expect(qb.where).toHaveBeenCalledWith('user_id = :userId AND read_at IS NULL', {
        userId: TEST_IDS.USER_ID,
      });
      expect(qb.execute).toHaveBeenCalled();
    });
  });
});
