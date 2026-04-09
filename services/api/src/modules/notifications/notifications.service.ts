import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { EventsGateway } from '../../websocket/events.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private eventsGateway: EventsGateway,
  ) {}

  /**
   * Create a notification, persist to DB, and push real-time via WebSocket.
   */
  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepository.create({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      data: dto.data,
    });
    const saved = await this.notificationRepository.save(notification);

    // Push real-time to the specific user (all their connected tabs/devices)
    this.eventsGateway.emitToUser(dto.userId, 'notification:new', {
      id: saved.id,
      type: saved.type,
      title: saved.title,
      body: saved.body,
      data: saved.data,
      createdAt: saved.createdAt,
    });

    // Also broadcast updated unread count
    const unreadCount = await this.getUnreadCount(dto.userId);
    this.eventsGateway.emitToUser(dto.userId, 'notification:count', { count: unreadCount });

    this.logger.debug(`Notification created: ${dto.type} → user ${dto.userId}`);
    return saved;
  }

  /**
   * Create notifications for multiple users (batch).
   */
  async createBatch(userIds: string[], dto: Omit<CreateNotificationDto, 'userId'>): Promise<void> {
    if (userIds.length === 0) return;

    const notifications = userIds.map(userId =>
      this.notificationRepository.create({
        userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        data: dto.data,
      }),
    );
    const saved = await this.notificationRepository.save(notifications);

    // Push real-time to each user
    for (const notification of saved) {
      this.eventsGateway.emitToUser(notification.userId, 'notification:new', {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        createdAt: notification.createdAt,
      });
    }
  }

  async findAll(userId: string, page: number = 1, limit: number = 20) {
    const [[items, total], unreadCount] = await Promise.all([
      this.notificationRepository.findAndCount({
        where: { userId },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.notificationRepository.count({ where: { userId, readAt: IsNull() } }),
    ]);
    return { items, total, page, limit, unreadCount };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, readAt: IsNull() },
    });
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (notification.readAt) {
      return notification; // Idempotent — already read
    }

    notification.readAt = new Date();
    const saved = await this.notificationRepository.save(notification);

    // Broadcast read state + updated count to all user sessions
    const unreadCount = await this.getUnreadCount(userId);
    this.eventsGateway.emitToUser(userId, 'notification:read', { id });
    this.eventsGateway.emitToUser(userId, 'notification:count', { count: unreadCount });

    return saved;
  }

  async markAllRead(userId: string): Promise<{ affected: number }> {
    const result = await this.notificationRepository
      .createQueryBuilder()
      .update()
      .set({ readAt: new Date() })
      .where('user_id = :userId AND read_at IS NULL', { userId })
      .execute();

    const affected = result.affected || 0;

    if (affected > 0) {
      // Broadcast to all user sessions: everything is read, count is 0
      this.eventsGateway.emitToUser(userId, 'notification:all-read', {
        timestamp: new Date().toISOString(),
      });
      this.eventsGateway.emitToUser(userId, 'notification:count', { count: 0 });
    }

    return { affected };
  }
}
