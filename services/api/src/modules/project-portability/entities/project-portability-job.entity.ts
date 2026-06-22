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
import {
  ImportPreviewResult,
  PortabilityImportOptions,
  PortabilityJobStatus,
  PortabilityResultSummary,
} from '../types/project-bundle.types';

@Entity('project_portability_jobs')
@Index('idx_portability_jobs_org', ['organizationId'])
@Index('idx_portability_jobs_triggered_by', ['triggeredById'])
export class ProjectPortabilityJob {
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

  @Column({ name: 'source_project_id', type: 'uuid', nullable: true })
  sourceProjectId: string | null;

  @Column({ name: 'target_project_id', type: 'uuid', nullable: true })
  targetProjectId: string | null;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'target_project_id' })
  targetProject: Project | null;

  @Column({ name: 'bundle_file_path', type: 'text', nullable: true })
  bundleFilePath: string | null;

  @Column({ name: 'bundle_export_id', type: 'uuid', nullable: true })
  bundleExportId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: PortabilityJobStatus;

  @Column({ name: 'target_type', type: 'varchar', length: 20 })
  targetType: string;

  @Column({ name: 'target_project_key', type: 'varchar', length: 10 })
  targetProjectKey: string;

  @Column({ name: 'target_project_name', type: 'varchar', length: 255 })
  targetProjectName: string;

  @Column({ name: 'source_type', type: 'varchar', length: 20, nullable: true })
  sourceType: string | null;

  @Column({ name: 'import_options', type: 'jsonb', nullable: true })
  importOptions: PortabilityImportOptions | null;

  @Column({ name: 'preview_result', type: 'jsonb', nullable: true })
  previewResult: ImportPreviewResult | null;

  @Column({ name: 'current_phase', type: 'smallint', default: 0 })
  currentPhase: number;

  @Column({ name: 'completed_phases', type: 'jsonb', default: [] })
  completedPhases: number[];

  @Column({ name: 'current_offset', type: 'int', default: 0 })
  currentOffset: number;

  @Column({ name: 'total_issues', type: 'int', default: 0 })
  totalIssues: number;

  @Column({ name: 'processed_issues', type: 'int', default: 0 })
  processedIssues: number;

  @Column({ name: 'failed_issues', type: 'int', default: 0 })
  failedIssues: number;

  @Column({ name: 'total_comments', type: 'int', default: 0 })
  totalComments: number;

  @Column({ name: 'processed_comments', type: 'int', default: 0 })
  processedComments: number;

  @Column({ name: 'total_sprints', type: 'int', default: 0 })
  totalSprints: number;

  @Column({ name: 'processed_sprints', type: 'int', default: 0 })
  processedSprints: number;

  @Column({ name: 'total_attachments', type: 'int', default: 0 })
  totalAttachments: number;

  @Column({ name: 'processed_attachments', type: 'int', default: 0 })
  processedAttachments: number;

  @Column({ name: 'attachment_offset', type: 'int', default: 0 })
  attachmentOffset: number;

  @Column({ name: 'result_summary', type: 'jsonb', nullable: true })
  resultSummary: PortabilityResultSummary | null;

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
