import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { Project } from '../../projects/entities/project.entity';

export type SearchReindexJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Durable record for long-running Elasticsearch reindex jobs (per project).
 * Incremental index-* jobs stay fire-and-forget; only reindex uses this table.
 */
@Entity('search_reindex_jobs')
@Index('idx_search_reindex_jobs_org', ['organizationId'])
@Index('idx_search_reindex_jobs_project', ['projectId'])
export class SearchReindexJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'triggered_by_id', type: 'uuid', nullable: true })
  triggeredById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'triggered_by_id' })
  triggeredBy: User | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: SearchReindexJobStatus;

  @Column({ name: 'current_phase', type: 'smallint', default: 0 })
  currentPhase: number;

  @Column({ name: 'current_offset', type: 'int', default: 0 })
  currentOffset: number;

  @Column({ name: 'completed_phases', type: 'jsonb', default: [] })
  completedPhases: number[];

  @Column({ name: 'total_issues', type: 'int', default: 0 })
  totalIssues: number;

  @Column({ name: 'processed_issues', type: 'int', default: 0 })
  processedIssues: number;

  @Column({ name: 'total_members', type: 'int', default: 0 })
  totalMembers: number;

  @Column({ name: 'processed_members', type: 'int', default: 0 })
  processedMembers: number;

  @Column({ name: 'error_log', type: 'jsonb', nullable: true })
  errorLog: string[] | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
