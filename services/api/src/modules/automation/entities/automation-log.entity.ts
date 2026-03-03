import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AutomationRule } from './automation-rule.entity';
import { Issue } from '../../issues/entities/issue.entity';

@Entity('automation_logs')
export class AutomationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId: string;

  @ManyToOne(() => AutomationRule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule: AutomationRule;

  @Column({ name: 'issue_id', type: 'uuid', nullable: true })
  issueId: string;

  @ManyToOne(() => Issue, { nullable: true })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue;

  @Column({ name: 'trigger_event', type: 'varchar', length: 100, nullable: true })
  triggerEvent: string;

  @Column({ name: 'actions_executed', type: 'jsonb', nullable: true })
  actionsExecuted: any[];

  @Column({ type: 'varchar', length: 20, default: 'success' })
  status: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'executed_at', type: 'timestamptz', default: () => 'NOW()' })
  executedAt: Date;
}
