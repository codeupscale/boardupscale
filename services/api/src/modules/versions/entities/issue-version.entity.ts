import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Issue } from '../../issues/entities/issue.entity';
import { Version } from './version.entity';

@Entity('issue_versions')
export class IssueVersion {
  @PrimaryColumn({ name: 'issue_id', type: 'uuid' })
  issueId: string;

  @PrimaryColumn({ name: 'version_id', type: 'uuid' })
  versionId: string;

  @PrimaryColumn({ name: 'relation_type', type: 'varchar', length: 20, default: 'fix' })
  relationType: string;

  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue;

  @ManyToOne(() => Version, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'version_id' })
  version: Version;
}
