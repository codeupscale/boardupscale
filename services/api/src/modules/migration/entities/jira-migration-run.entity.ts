import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { JiraConnection } from '../../import/entities/jira-connection.entity';

export type MigrationRunStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface SelectedProject {
  key: string;
  name: string;
  issueCount: number;
}

export interface MigrationOptions {
  importAttachments: boolean;
  importComments: boolean;
  inviteMembers: boolean;
}

export interface MigrationResultSummary {
  projects: Array<{
    key: string;
    name: string;
    issueCount: number;
    status: 'success' | 'partial' | 'failed';
    boardupscaleProjectId?: string;
  }>;
  totalMigrated: number;
  totalFailed: number;
  failedItems: Array<{ type: string; key: string; reason: string }>;
  attachmentsSkipped?: boolean;
  durationMs?: number;
}

/**
 * Durable record of a Jira → Boardupscale migration run.
 *
 * Tracks per-phase progress to support resume-on-failure semantics.
 * Redis holds real-time counters for polling; this table is the permanent
 * audit trail and survives Redis eviction.
 *
 * Phases:
 *   0 = not started
 *   1 = members
 *   2 = projects + boards + statuses
 *   3 = sprints
 *   4 = issues (paginated — currentOffset is the page cursor)
 *   5 = comments + attachments
 *   6 = issue links
 */
@Entity('jira_migration_runs')
@Index('idx_jira_migration_runs_org', ['organizationId'])
@Index('idx_jira_migration_runs_triggered_by', ['triggeredById'])
@Index('idx_jira_migration_runs_connection', ['connectionId'])
export class JiraMigrationRun {
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

  @Column({ name: 'connection_id', type: 'uuid', nullable: true })
  connectionId: string | null;

  @ManyToOne(() => JiraConnection, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'connection_id' })
  connection: JiraConnection | null;

  // ── Configuration saved at start time ──────────────────────────────────────

  /** Projects selected for migration, e.g. [{ key: 'PROJ', name: 'Project', issueCount: 42 }] */
  @Column({ name: 'selected_projects', type: 'jsonb', nullable: true })
  selectedProjects: SelectedProject[] | null;

  /** Jira status → Boardupscale status mapping, e.g. { "To Do": "TODO" } */
  @Column({ name: 'status_mapping', type: 'jsonb', nullable: true })
  statusMapping: Record<string, string> | null;

  /** Jira role → Boardupscale role mapping, e.g. { "Project Lead": "manager" } */
  @Column({ name: 'role_mapping', type: 'jsonb', nullable: true })
  roleMapping: Record<string, string> | null;

  /** User-selected migration options */
  @Column({ name: 'options', type: 'jsonb', nullable: true })
  options: MigrationOptions | null;

  // ── Runtime state ───────────────────────────────────────────────────────────

  @Column({
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  status: MigrationRunStatus;

  /**
   * Which phase the job is currently executing (0 = not started).
   * Used for resume-on-failure: BullMQ re-queues starting from this phase.
   */
  @Column({ name: 'current_phase', type: 'smallint', default: 0 })
  currentPhase: number;

  /**
   * Issue pagination cursor for phase 4 resume.
   * Stores the number of issues already processed so the job can skip ahead.
   */
  @Column({ name: 'current_offset', type: 'int', default: 0 })
  currentOffset: number;

  // ── Progress counters ───────────────────────────────────────────────────────

  @Column({ name: 'total_projects', type: 'int', default: 0 })
  totalProjects: number;

  @Column({ name: 'processed_projects', type: 'int', default: 0 })
  processedProjects: number;

  @Column({ name: 'total_issues', type: 'int', default: 0 })
  totalIssues: number;

  @Column({ name: 'processed_issues', type: 'int', default: 0 })
  processedIssues: number;

  @Column({ name: 'failed_issues', type: 'int', default: 0 })
  failedIssues: number;

  @Column({ name: 'total_members', type: 'int', default: 0 })
  totalMembers: number;

  @Column({ name: 'processed_members', type: 'int', default: 0 })
  processedMembers: number;

  @Column({ name: 'total_sprints', type: 'int', default: 0 })
  totalSprints: number;

  @Column({ name: 'processed_sprints', type: 'int', default: 0 })
  processedSprints: number;

  @Column({ name: 'total_comments', type: 'int', default: 0 })
  totalComments: number;

  @Column({ name: 'processed_comments', type: 'int', default: 0 })
  processedComments: number;

  // ── Final result ────────────────────────────────────────────────────────────

  /** Full summary written on completion (also downloadable as JSON report) */
  @Column({ name: 'result_summary', type: 'jsonb', nullable: true })
  resultSummary: MigrationResultSummary | null;

  /** Last 100 error strings collected during the run */
  @Column({ name: 'error_log', type: 'jsonb', nullable: true })
  errorLog: string[] | null;

  // ── Timestamps ──────────────────────────────────────────────────────────────

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
