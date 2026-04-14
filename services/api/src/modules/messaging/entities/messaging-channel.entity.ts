import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { MessagingChannelMember } from './messaging-channel-member.entity';
import { MessagingMessage } from './messaging-message.entity';

export enum ChannelType {
  DIRECT = 'direct',
  GROUP = 'group',
}

@Entity('messaging_channels')
@Index('IDX_messaging_channels_org', ['organizationId'])
export class MessagingChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'enum', enum: ChannelType, default: ChannelType.GROUP })
  type: ChannelType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @OneToMany(() => MessagingChannelMember, (m) => m.channel)
  members: MessagingChannelMember[];

  @OneToMany(() => MessagingMessage, (m) => m.channel)
  messages: MessagingMessage[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
