import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Issue } from '../../issues/entities/issue.entity';
import { CustomFieldDefinition } from './custom-field-definition.entity';

@Entity('custom_field_values')
export class CustomFieldValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'issue_id', type: 'uuid' })
  issueId: string;

  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue;

  @Column({ name: 'field_id', type: 'uuid' })
  fieldId: string;

  @ManyToOne(() => CustomFieldDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_id' })
  field: CustomFieldDefinition;

  @Column({ type: 'jsonb' })
  value: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
