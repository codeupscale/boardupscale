import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('billing_plans')
export class BillingPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  slug: string;

  @Column({ type: 'int', name: 'price_monthly', default: 0 })
  priceMonthly: number;

  @Column({ type: 'int', name: 'price_yearly', default: 0 })
  priceYearly: number;

  @Column({ type: 'int', name: 'max_users', default: -1 })
  maxUsers: number;

  @Column({ type: 'int', name: 'max_storage_gb', default: 1 })
  maxStorageGb: number;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  features: Record<string, boolean>;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
