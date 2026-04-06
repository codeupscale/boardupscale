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

/**
 * Stores Jira connection credentials for an organisation.
 *
 * api_token_enc is AES-256-GCM encrypted at the service layer before
 * persistence. It is NEVER returned to clients in plaintext.
 */
@Entity('jira_connections')
export class JiraConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  /** Jira base URL — e.g. https://acme.atlassian.net */
  @Column({ name: 'jira_url', type: 'varchar', length: 500 })
  jiraUrl: string;

  /** Jira account email (used as Basic Auth username) */
  @Column({ name: 'jira_email', type: 'varchar', length: 255 })
  jiraEmail: string;

  /** AES-256-GCM encrypted API token — never exposed in plaintext via API */
  @Column({ name: 'api_token_enc', type: 'text', select: false })
  apiTokenEnc: string;

  /**
   * AES-256-GCM encrypted OAuth refresh token.
   * NULL for API-token connections (they don't expire).
   */
  @Column({ name: 'refresh_token_enc', type: 'text', nullable: true, select: false })
  refreshTokenEnc: string | null;

  /**
   * When the current OAuth access token expires.
   * NULL for API-token connections.
   */
  @Column({ name: 'token_expires_at', type: 'timestamptz', nullable: true })
  tokenExpiresAt: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'last_tested_at', type: 'timestamptz', nullable: true })
  lastTestedAt: Date;

  @Column({ name: 'last_test_ok', type: 'boolean', nullable: true })
  lastTestOk: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
