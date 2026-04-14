import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { MessagingChannel } from './messaging-channel.entity';
import { User } from '../../users/entities/user.entity';

@Entity('messaging_channel_members')
@Unique('UQ_messaging_channel_member', ['channelId', 'userId'])
@Index('IDX_messaging_channel_members_user', ['userId'])
export class MessagingChannelMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @ManyToOne(() => MessagingChannel, (c) => c.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id' })
  channel: MessagingChannel;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;

  @Column({ name: 'last_read_at', type: 'timestamptz', nullable: true })
  lastReadAt: Date | null;
}
