import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository, IsNull, In } from 'typeorm';
import { Queue } from 'bullmq';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotifyUsersDto } from './dto/notify.dto';
import { EventsGateway } from '../../websocket/events.gateway';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_FILTER_GROUPS,
  NOTIFICATION_JOB_BATCH,
  NOTIFICATION_QUEUE,
  NOTIFICATION_SYNC_MAX_RECIPIENTS,
  type NotificationFilter,
} from './notification.constants';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private eventsGateway: EventsGateway,
    @InjectQueue(NOTIFICATION_QUEUE)
    private notificationQueue: Queue,
  ) {}

  /**
   * Primary entry for domain events.
   * - Excludes actor by default (set includeActor for create flows)
   * - Dedupes recipients
   * - Respects inApp preference before sync create or BullMQ enqueue
   * - Sync for 1 recipient; BullMQ notify-batch for fan-out
   *
   * Callers must use this method — do not enqueue notify-batch directly.
   * The worker trusts the pre-filtered recipient list (no second inApp pass).
   */
  async notify(dto: NotifyUsersDto): Promise<void> {
    const unique = [
      ...new Set(
        dto.recipientUserIds.filter((id): id is string => {
          if (typeof id !== 'string' || id.length === 0) return false;
          if (!dto.includeActor && id === dto.actorUserId) return false;
          return true;
        }),
      ),
    ];

    if (unique.length === 0) {
      return;
    }

    const eligible = await this.filterInAppRecipients(unique);
    if (eligible.length === 0) {
      return;
    }

    const payload = {
      organizationId: dto.organizationId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      data: {
        ...dto.data,
        organizationId: dto.organizationId,
        actorUserId: dto.actorUserId,
      },
    };

    if (eligible.length <= NOTIFICATION_SYNC_MAX_RECIPIENTS) {
      await this.create({
        ...payload,
        userId: eligible[0],
      });
      return;
    }

    await this.notificationQueue.add(
      NOTIFICATION_JOB_BATCH,
      {
        organizationId: dto.organizationId,
        userIds: eligible,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        data: payload.data,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );
  }

  /**
   * Create a notification, persist to DB, and push real-time via WebSocket.
   */
  async create(dto: CreateNotificationDto): Promise<Notification> {
    if (!dto.organizationId) {
      throw new Error('organizationId is required to create a notification');
    }

    const notification = this.notificationRepository.create({
      organizationId: dto.organizationId,
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      data: {
        ...dto.data,
        organizationId: dto.organizationId,
      },
    });
    const saved = await this.notificationRepository.save(notification);

    this.emitNew(saved);
    const unreadCount = await this.getUnreadCount(dto.userId, dto.organizationId);
    this.eventsGateway.emitToUser(dto.userId, 'notification:count', {
      count: unreadCount,
      organizationId: dto.organizationId,
    });

    return saved;
  }

  /**
   * Sync batch create (used by tests / internal). Prefer notify() for domain events.
   */
  async createBatch(
    userIds: string[],
    dto: Omit<CreateNotificationDto, 'userId'>,
  ): Promise<void> {
    if (userIds.length === 0) return;

    const notifications = userIds.map((userId) =>
      this.notificationRepository.create({
        organizationId: dto.organizationId,
        userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        data: { ...dto.data, organizationId: dto.organizationId },
      }),
    );
    const saved = await this.notificationRepository.save(notifications);

    for (const notification of saved) {
      this.emitNew(notification);
      const unreadCount = await this.getUnreadCount(
        notification.userId,
        notification.organizationId,
      );
      this.eventsGateway.emitToUser(notification.userId, 'notification:count', {
        count: unreadCount,
        organizationId: notification.organizationId,
      });
    }
  }

  async findAll(
    userId: string,
    organizationId: string,
    page: number = 1,
    limit: number = 20,
    filter: NotificationFilter = 'all',
  ) {
    const qb = this.notificationRepository
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .andWhere('n.organization_id = :organizationId', { organizationId });

    if (filter === 'unread') {
      qb.andWhere('n.read_at IS NULL');
    } else if (filter === 'mentions' || filter === 'assigned') {
      const types = NOTIFICATION_FILTER_GROUPS[filter];
      if (types) {
        qb.andWhere('n.type IN (:...types)', { types });
      }
    }

    qb.orderBy('n.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const unreadCount = await this.getUnreadCount(userId, organizationId);

    return { items, total, page, limit, unreadCount };
  }

  async getUnreadCount(userId: string, organizationId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, organizationId, readAt: IsNull() },
    });
  }

  async markRead(
    id: string,
    userId: string,
    organizationId: string,
  ): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId, organizationId },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (notification.readAt) {
      return notification;
    }

    notification.readAt = new Date();
    const saved = await this.notificationRepository.save(notification);

    const unreadCount = await this.getUnreadCount(userId, organizationId);
    this.eventsGateway.emitToUser(userId, 'notification:read', {
      id,
      organizationId,
    });
    this.eventsGateway.emitToUser(userId, 'notification:count', {
      count: unreadCount,
      organizationId,
    });

    return saved;
  }

  async markAllRead(
    userId: string,
    organizationId: string,
  ): Promise<{ affected: number }> {
    const result = await this.notificationRepository
      .createQueryBuilder()
      .update()
      .set({ readAt: new Date() })
      .where(
        'user_id = :userId AND organization_id = :organizationId AND read_at IS NULL',
        { userId, organizationId },
      )
      .execute();

    const affected = result.affected || 0;

    if (affected > 0) {
      this.eventsGateway.emitToUser(userId, 'notification:all-read', {
        timestamp: new Date().toISOString(),
        organizationId,
      });
      this.eventsGateway.emitToUser(userId, 'notification:count', {
        count: 0,
        organizationId,
      });
    }

    return { affected };
  }

  async getPreferences(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...(user.notificationPreferences || {}),
    };
  }

  async updatePreferences(
    userId: string,
    prefs: Partial<{ email: boolean; inApp: boolean; sound: boolean }>,
  ) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const next = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...(user.notificationPreferences || {}),
      ...Object.fromEntries(
        Object.entries(prefs).filter(([, v]) => typeof v === 'boolean'),
      ),
    };

    user.notificationPreferences = next;
    await this.usersRepository.save(user);
    return next;
  }

  private emitNew(notification: Notification) {
    this.eventsGateway.emitToUser(notification.userId, 'notification:new', {
      id: notification.id,
      organizationId: notification.organizationId,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      read: false,
      createdAt: notification.createdAt,
    });
  }

  private async filterInAppRecipients(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];

    const users = await this.usersRepository.find({
      where: { id: In(userIds) },
      select: ['id', 'notificationPreferences'],
    });

    const eligible = new Set<string>();
    for (const user of users) {
      const prefs = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...(user.notificationPreferences || {}),
      };
      if (prefs.inApp !== false) {
        eligible.add(user.id);
      }
    }

    // Preserve caller order; drop muted / missing users.
    return userIds.filter((id) => eligible.has(id));
  }
}
