import {
  Entity,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Issue } from '../../issues/entities/issue.entity';
import { Component } from './component.entity';

@Entity('issue_components')
export class IssueComponent {
  @PrimaryColumn({ name: 'issue_id', type: 'uuid' })
  issueId: string;

  @PrimaryColumn({ name: 'component_id', type: 'uuid' })
  componentId: string;

  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue;

  @ManyToOne(() => Component, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'component_id' })
  component: Component;
}
