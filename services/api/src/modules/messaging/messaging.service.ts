import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan } from 'typeorm';
import { MessagingChannel, ChannelType } from './entities/messaging-channel.entity';
import { MessagingChannelMember } from './entities/messaging-channel-member.entity';
import { MessagingMessage, MessageType } from './entities/messaging-message.entity';
import { EventsGateway } from '../../websocket/events.gateway';
import { CreateChannelDto } from './dto/create-channel.dto';
import { SendMessageDto } from './dto/send-message.dto';

export interface ChannelWithPreview extends MessagingChannel {
  lastMessage?: MessagingMessage | null;
  unreadCount?: number;
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    @InjectRepository(MessagingChannel)
    private channelRepository: Repository<MessagingChannel>,
    @InjectRepository(MessagingChannelMember)
    private memberRepository: Repository<MessagingChannelMember>,
    @InjectRepository(MessagingMessage)
    private messageRepository: Repository<MessagingMessage>,
    private eventsGateway: EventsGateway,
  ) {}

  /**
   * List all channels the user is a member of, with last message preview and unread count.
   */
  async getChannels(userId: string, organizationId: string): Promise<ChannelWithPreview[]> {
    // Get all channel memberships for this user within this org
    const memberships = await this.memberRepository
      .createQueryBuilder('cm')
      .innerJoinAndSelect('cm.channel', 'channel')
      .leftJoinAndSelect('channel.members', 'members')
      .leftJoinAndSelect('members.user', 'memberUser')
      .where('cm.userId = :userId', { userId })
      .andWhere('channel.organizationId = :organizationId', { organizationId })
      .getMany();

    const result: ChannelWithPreview[] = [];

    for (const membership of memberships) {
      const channel = membership.channel as ChannelWithPreview;

      // Get last message
      const lastMessage = await this.messageRepository.findOne({
        where: { channelId: channel.id, deletedAt: IsNull() },
        order: { createdAt: 'DESC' },
        relations: ['sender'],
      });
      channel.lastMessage = lastMessage || null;

      // Get unread count
      const unreadQuery = this.messageRepository
        .createQueryBuilder('msg')
        .where('msg.channelId = :channelId', { channelId: channel.id })
        .andWhere('msg.deletedAt IS NULL')
        .andWhere('msg.senderId != :userId', { userId });

      if (membership.lastReadAt) {
        unreadQuery.andWhere('msg.createdAt > :lastReadAt', {
          lastReadAt: membership.lastReadAt,
        });
      }

      channel.unreadCount = await unreadQuery.getCount();

      result.push(channel);
    }

    // Sort by last message time (most recent first)
    result.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt?.getTime() ?? a.createdAt.getTime();
      const bTime = b.lastMessage?.createdAt?.getTime() ?? b.createdAt.getTime();
      return bTime - aTime;
    });

    return result;
  }

  /**
   * Create a new group channel.
   */
  async createGroupChannel(
    dto: CreateChannelDto,
    userId: string,
    organizationId: string,
  ): Promise<MessagingChannel> {
    const channel = this.channelRepository.create({
      organizationId,
      type: ChannelType.GROUP,
      name: dto.name,
      createdById: userId,
    });
    const saved = await this.channelRepository.save(channel);

    // Add the creator as a member
    const allMemberIds = new Set([userId, ...dto.memberIds]);

    const memberEntities = Array.from(allMemberIds).map((memberId) =>
      this.memberRepository.create({
        channelId: saved.id,
        userId: memberId,
      }),
    );
    await this.memberRepository.save(memberEntities);

    // Create system message
    await this.messageRepository.save(
      this.messageRepository.create({
        channelId: saved.id,
        senderId: userId,
        content: `created the channel "${dto.name}"`,
        type: MessageType.SYSTEM,
      }),
    );

    const full = await this.channelRepository.findOne({
      where: { id: saved.id, organizationId },
      relations: ['members', 'members.user'],
    });

    // Notify members via WebSocket
    for (const memberId of allMemberIds) {
      this.eventsGateway.emitToUser(memberId, 'chat:channel-created', full);
    }

    return full!;
  }

  /**
   * Get or create a direct message channel between two users.
   */
  async getOrCreateDirectChannel(
    otherUserId: string,
    userId: string,
    organizationId: string,
  ): Promise<MessagingChannel> {
    if (otherUserId === userId) {
      throw new BadRequestException('Cannot create a direct message with yourself');
    }

    // Check if a DM channel already exists between these two users in this org
    const existing = await this.channelRepository
      .createQueryBuilder('channel')
      .innerJoin('channel.members', 'm1', 'm1.userId = :userId', { userId })
      .innerJoin('channel.members', 'm2', 'm2.userId = :otherUserId', { otherUserId })
      .where('channel.organizationId = :organizationId', { organizationId })
      .andWhere('channel.type = :type', { type: ChannelType.DIRECT })
      .getOne();

    if (existing) {
      const full = await this.channelRepository.findOne({
        where: { id: existing.id, organizationId },
        relations: ['members', 'members.user'],
      });
      return full!;
    }

    // Create new DM channel
    const channel = this.channelRepository.create({
      organizationId,
      type: ChannelType.DIRECT,
      name: null,
      createdById: userId,
    });
    const saved = await this.channelRepository.save(channel);

    // Add both users as members
    await this.memberRepository.save([
      this.memberRepository.create({ channelId: saved.id, userId }),
      this.memberRepository.create({ channelId: saved.id, userId: otherUserId }),
    ]);

    const full = await this.channelRepository.findOne({
      where: { id: saved.id, organizationId },
      relations: ['members', 'members.user'],
    });

    // Notify both users
    this.eventsGateway.emitToUser(userId, 'chat:channel-created', full);
    this.eventsGateway.emitToUser(otherUserId, 'chat:channel-created', full);

    return full!;
  }

  /**
   * Get paginated messages for a channel (cursor-based).
   */
  async getMessages(
    channelId: string,
    userId: string,
    organizationId: string,
    before?: string,
    limit: number = 50,
  ): Promise<{ messages: MessagingMessage[]; hasMore: boolean }> {
    // Verify membership and org scope
    await this.verifyChannelMembership(channelId, userId, organizationId);

    const qb = this.messageRepository
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.sender', 'sender')
      .where('msg.channelId = :channelId', { channelId })
      .andWhere('msg.deletedAt IS NULL')
      .orderBy('msg.createdAt', 'DESC')
      .take(limit + 1);

    if (before) {
      const cursorMsg = await this.messageRepository.findOne({
        where: { id: before, channelId },
      });
      if (cursorMsg) {
        qb.andWhere('msg.createdAt < :cursorDate', { cursorDate: cursorMsg.createdAt });
      }
    }

    const messages = await qb.getMany();
    const hasMore = messages.length > limit;
    if (hasMore) {
      messages.pop();
    }

    // Return in chronological order
    messages.reverse();

    return { messages, hasMore };
  }

  /**
   * Send a message to a channel.
   */
  async sendMessage(
    channelId: string,
    dto: SendMessageDto,
    userId: string,
    organizationId: string,
  ): Promise<MessagingMessage> {
    await this.verifyChannelMembership(channelId, userId, organizationId);

    const message = this.messageRepository.create({
      channelId,
      senderId: userId,
      content: dto.content,
      type: MessageType.TEXT,
    });
    const saved = await this.messageRepository.save(message);

    const full = await this.messageRepository.findOne({
      where: { id: saved.id },
      relations: ['sender'],
    });

    // Update sender's lastReadAt
    await this.memberRepository.update(
      { channelId, userId },
      { lastReadAt: new Date() },
    );

    // Broadcast to channel room via WebSocket
    this.eventsGateway.server
      .to(`chat:channel:${channelId}`)
      .emit('chat:message', full);

    // Also notify all channel members who may not be in the room
    const members = await this.memberRepository.find({
      where: { channelId },
    });
    for (const member of members) {
      if (member.userId !== userId) {
        this.eventsGateway.emitToUser(member.userId, 'chat:new-message', {
          channelId,
          message: full,
        });
      }
    }

    return full!;
  }

  /**
   * Mark a channel as read for the current user.
   */
  async markAsRead(
    channelId: string,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.verifyChannelMembership(channelId, userId, organizationId);

    await this.memberRepository.update(
      { channelId, userId },
      { lastReadAt: new Date() },
    );

    // Notify channel that this user has read messages
    this.eventsGateway.server
      .to(`chat:channel:${channelId}`)
      .emit('chat:read', { channelId, userId, readAt: new Date() });
  }

  /**
   * Get total unread message count across all channels for a user.
   */
  async getUnreadCount(userId: string, organizationId: string): Promise<number> {
    const memberships = await this.memberRepository
      .createQueryBuilder('cm')
      .innerJoin('cm.channel', 'channel')
      .where('cm.userId = :userId', { userId })
      .andWhere('channel.organizationId = :organizationId', { organizationId })
      .getMany();

    let total = 0;

    for (const membership of memberships) {
      const qb = this.messageRepository
        .createQueryBuilder('msg')
        .where('msg.channelId = :channelId', { channelId: membership.channelId })
        .andWhere('msg.deletedAt IS NULL')
        .andWhere('msg.senderId != :userId', { userId });

      if (membership.lastReadAt) {
        qb.andWhere('msg.createdAt > :lastReadAt', {
          lastReadAt: membership.lastReadAt,
        });
      }

      total += await qb.getCount();
    }

    return total;
  }

  /**
   * Verify that the user is a member of the channel and that the channel belongs to the org.
   */
  private async verifyChannelMembership(
    channelId: string,
    userId: string,
    organizationId: string,
  ): Promise<MessagingChannelMember> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId, organizationId },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const membership = await this.memberRepository.findOne({
      where: { channelId, userId },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this channel');
    }

    return membership;
  }
}
