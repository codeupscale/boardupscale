import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ChatMessage } from './chat-message.entity';

@Entity('chat_feedback')
@Index(['messageId', 'userId'], { unique: true })
export class ChatFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'message_id', type: 'uuid' })
  messageId: string;

  @ManyToOne(() => ChatMessage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message: ChatMessage;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ type: 'smallint' })
  rating: number; // 1 = thumbs up, -1 = thumbs down

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
