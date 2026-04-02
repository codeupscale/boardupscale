import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { JiraConnection } from './jira-connection.entity';
import { Project } from '../../projects/entities/project.entity';

export type ImportJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ImportJobSource = 'file' | 'api';

/**
 * Durable record of a Jira import run.
 *
 * Redis holds the same data for real-time polling (low latency).
 * This table is the permanent audit trail and survives Redis eviction.
 */
@Entity('jira_import_jobs')
export class JiraImportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'triggered_by_id', type: 'uuid' })
  triggeredById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'triggered_by_id' })
  triggeredBy: User;

  @Column({ name: 'jira_connection_id', type: 'uuid', nullable: true })
  jiraConnectionId: string;

  @ManyToOne(() => JiraConnection, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'jira_connection_id' })
  jiraConnection: JiraConnection;

  /** 'file' = JSON export upload; 'api' = live Jira REST API fetch */
  @Column({ type: 'varchar', length: 20, default: 'file' })
  source: ImportJobSource;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: ImportJobStatus;

  @Column({ name: 'total_issues', type: 'int', default: 0 })
  totalIssues: number;

  @Column({ name: 'processed_issues', type: 'int', default: 0 })
  processedIssues: number;

  @Column({ name: 'failed_issues', type: 'int', default: 0 })
  failedIssues: number;

  /** Last 100 error messages stored as a JSON array */
  @Column({ name: 'error_log', type: 'jsonb', nullable: true })
  errorLog: string[];

  /** The Boardupscale project that was created/targeted by this import */
  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  /** Jira project keys that were imported (e.g. ['PROJ', 'MYAPP']) */
  @Column({ name: 'jira_project_keys', type: 'text', array: true, nullable: true })
  jiraProjectKeys: string[];

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
