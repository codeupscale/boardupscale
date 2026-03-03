import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Issue } from '../../issues/entities/issue.entity';
import { User } from '../../users/entities/user.entity';

@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'issue_id', type: 'uuid', nullable: true })
  issueId: string;

  @ManyToOne(() => Issue, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue;

  @Column({ name: 'comment_id', type: 'uuid', nullable: true })
  commentId: string;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by' })
  uploader: User;

  @Column({ name: 'file_name', type: 'varchar', length: 500 })
  fileName: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize: number;

  @Column({ name: 'mime_type', type: 'varchar', length: 255 })
  mimeType: string;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey: string;

  @Column({ name: 'storage_bucket', type: 'varchar', length: 255 })
  storageBucket: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
