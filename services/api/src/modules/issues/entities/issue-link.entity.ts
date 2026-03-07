import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Issue } from './issue.entity';
import { User } from '../../users/entities/user.entity';

@Entity('issue_links')
export class IssueLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source_issue_id', type: 'uuid' })
  sourceIssueId: string;

  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_issue_id' })
  sourceIssue: Issue;

  @Column({ name: 'target_issue_id', type: 'uuid' })
  targetIssueId: string;

  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_issue_id' })
  targetIssue: Issue;

  @Column({ name: 'link_type', type: 'varchar', length: 50 })
  linkType: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
