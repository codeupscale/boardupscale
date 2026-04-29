import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { Sprint } from '../../sprints/entities/sprint.entity';
import { IssueStatus } from './issue-status.entity';
import { User } from '../../users/entities/user.entity';

@Entity('issues')
export class Issue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'sprint_id', type: 'uuid', nullable: true })
  sprintId: string;

  @ManyToOne(() => Sprint, { nullable: true })
  @JoinColumn({ name: 'sprint_id' })
  sprint: Sprint;

  @Column({ name: 'status_id', type: 'uuid', nullable: true })
  statusId: string;

  @ManyToOne(() => IssueStatus, { nullable: true })
  @JoinColumn({ name: 'status_id' })
  status: IssueStatus;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  @Column({ name: 'assignee_id', type: 'uuid', nullable: true })
  assigneeId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assignee_id' })
  assignee: User;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string;

  @ManyToOne(() => Issue, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: Issue;

  // DB column is "number" (integer, auto-seq per project)
  @Column({ name: 'number', type: 'int' })
  number: number;

  @Column({ type: 'varchar', length: 50 })
  key: string;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 50, default: 'task' })
  type: string;

  @Column({ type: 'varchar', length: 50, default: 'medium' })
  priority: string;

  @Column({ name: 'story_points', type: 'decimal', precision: 6, scale: 1, nullable: true })
  storyPoints: number;

  @Column({ name: 'time_estimate', type: 'int', nullable: true })
  timeEstimate: number;

  @Column({ name: 'time_spent', type: 'int', default: 0 })
  timeSpent: number;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string;

  @Column({ type: 'text', array: true, default: () => `'{}'` })
  labels: string[];

  /**
   * Original Jira issue key (e.g. 'PROJ-123').
   * Populated during Jira imports; NULL for native Boardupscale issues.
   * Used by the upsert logic to make imports idempotent.
   */
  @Column({ name: 'jira_key', type: 'varchar', length: 100, nullable: true })
  jiraKey: string;

  /**
   * Fields that have been manually edited by a user after a Jira import.
   * The migration worker honours this list and skips overwriting these fields
   * on re-migration, preserving intentional changes made inside Boardupscale.
   * Example values: ['title', 'description', 'priority', 'assignee_id']
   */
  @Column({ name: 'locked_fields', type: 'text', array: true, default: () => `'{}'` })
  lockedFields: string[];

  @Column({ type: 'float', default: 0 })
  position: number;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date;

  // AI embedding vector (1536 dims for text-embedding-3-small) — not loaded by default
  @Column({ type: 'float8', array: true, nullable: true, select: false })
  embedding: number[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
