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
import { BillingPlan } from './billing-plan.entity';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'organization_id', unique: true })
  organizationId: string;

  @Column({ type: 'uuid', name: 'plan_id' })
  planId: string;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: string;

  @Column({ type: 'varchar', length: 255, name: 'stripe_customer_id', nullable: true })
  stripeCustomerId: string;

  @Column({ type: 'varchar', length: 255, name: 'stripe_subscription_id', nullable: true })
  stripeSubscriptionId: string;

  @Column({ type: 'timestamptz', name: 'current_period_start', nullable: true })
  currentPeriodStart: Date;

  @Column({ type: 'timestamptz', name: 'current_period_end', nullable: true })
  currentPeriodEnd: Date;

  @Column({ type: 'boolean', name: 'cancel_at_period_end', default: false })
  cancelAtPeriodEnd: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => BillingPlan)
  @JoinColumn({ name: 'plan_id' })
  plan: BillingPlan;
}
