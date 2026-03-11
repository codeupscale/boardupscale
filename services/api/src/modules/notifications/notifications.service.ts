import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { EventsGateway } from '../../websocket/events.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private eventsGateway: EventsGateway,
  ) {}

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepository.create({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      data: dto.data,
    });
    const saved = await this.notificationRepository.save(notification);

    // Push real-time notification to the user via WebSocket
    this.eventsGateway.emitToUser(dto.userId, 'notification:new', saved);

    return saved;
  }

  async findAll(userId: string, page: number = 1, limit: number = 20) {
    const [items, total] = await this.notificationRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    notification.readAt = new Date();
    return this.notificationRepository.save(notification);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationRepository
      .createQueryBuilder()
      .update()
      .set({ readAt: new Date() })
      .where('user_id = :userId AND read_at IS NULL', { userId })
      .execute();
  }
}
