import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { GitHubConnection } from './github-connection.entity';
import { Issue } from '../../issues/entities/issue.entity';

@Entity('github_events')
export class GitHubEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'github_connection_id', type: 'uuid' })
  githubConnectionId: string;

  @ManyToOne(() => GitHubConnection, (conn) => conn.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'github_connection_id' })
  connection: GitHubConnection;

  @Column({ name: 'issue_id', type: 'uuid', nullable: true })
  issueId: string;

  @ManyToOne(() => Issue, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  eventType: string;

  @Column({ name: 'pr_number', type: 'int', nullable: true })
  prNumber: number;

  @Column({ name: 'pr_title', type: 'text', nullable: true })
  prTitle: string;

  @Column({ name: 'pr_url', type: 'text', nullable: true })
  prUrl: string;

  @Column({ name: 'branch_name', type: 'varchar', length: 255, nullable: true })
  branchName: string;

  @Column({ name: 'commit_sha', type: 'varchar', length: 40, nullable: true })
  commitSha: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  author: string;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
