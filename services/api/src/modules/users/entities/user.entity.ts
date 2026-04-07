import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Organization } from '../../organizations/entities/organization.entity';
import { OrganizationMember } from '../../organizations/entities/organization-member.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'display_name', type: 'varchar', length: 255 })
  displayName: string;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  @Exclude()
  passwordHash: string;

  @Column({ type: 'varchar', length: 50, default: 'member' })
  role: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'email_verified', type: 'boolean', default: false })
  emailVerified: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  timezone: string;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  language: string;

  @Column({ name: 'oauth_provider', type: 'varchar', length: 50, nullable: true })
  oauthProvider: string;

  @Column({ name: 'oauth_id', type: 'varchar', length: 255, nullable: true })
  oauthId: string;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date;

  @Column({ name: 'email_verification_token', type: 'varchar', length: 255, nullable: true })
  @Exclude()
  emailVerificationToken: string;

  @Column({ name: 'email_verification_expiry', type: 'timestamptz', nullable: true })
  emailVerificationExpiry: Date;

  @Column({ name: 'password_reset_token', type: 'varchar', length: 255, nullable: true })
  @Exclude()
  passwordResetToken: string;

  @Column({ name: 'password_reset_expiry', type: 'timestamptz', nullable: true })
  passwordResetExpiry: Date;

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date;

  @Column({
    name: 'notification_preferences',
    type: 'jsonb',
    default: () => `'{"email":true,"inApp":true}'`,
  })
  notificationPreferences: Record<string, boolean>;

  @Column({ name: 'two_fa_secret', type: 'text', nullable: true })
  @Exclude()
  twoFaSecret: string;

  @Column({ name: 'two_fa_enabled', type: 'boolean', default: false })
  twoFaEnabled: boolean;

  @Column({ name: 'backup_codes', type: 'text', array: true, nullable: true })
  @Exclude()
  backupCodes: string[];

  @Column({ name: 'jira_account_id', type: 'varchar', length: 255, nullable: true })
  jiraAccountId: string | null;

  @OneToMany(() => OrganizationMember, (m) => m.user)
  memberships: OrganizationMember[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
