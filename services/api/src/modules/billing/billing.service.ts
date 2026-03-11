import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingPlan } from './entities/billing-plan.entity';
import { Subscription } from './entities/subscription.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(BillingPlan)
    private planRepository: Repository<BillingPlan>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async getPlans(): Promise<BillingPlan[]> {
    return this.planRepository.find({
      where: { isActive: true },
      order: { priceMonthly: 'ASC' },
    });
  }

  async getSubscription(organizationId: string): Promise<Subscription | null> {
    return this.subscriptionRepository.findOne({
      where: { organizationId },
      relations: ['plan'],
    });
  }

  async getUsage(organizationId: string): Promise<{
    userCount: number;
    maxUsers: number;
    storageUsedGb: number;
    maxStorageGb: number;
    aiTokensToday: number;
    aiTokensLimit: number;
  }> {
    const userCount = await this.userRepository.count({
      where: { organizationId, isActive: true },
    });

    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
      relations: ['plan'],
    });

    const plan = subscription?.plan;

    return {
      userCount,
      maxUsers: plan?.maxUsers ?? 5,
      storageUsedGb: 0.2, // placeholder — would come from file storage metrics
      maxStorageGb: plan?.maxStorageGb ?? 1,
      aiTokensToday: 0, // placeholder — would aggregate from ai_usage_logs
      aiTokensLimit: plan?.features?.ai ? 10000 : 0,
    };
  }

  async createCheckoutSession(
    organizationId: string,
    planSlug: string,
    billingCycle: 'monthly' | 'yearly',
  ): Promise<{ url: string }> {
    const plan = await this.planRepository.findOne({
      where: { slug: planSlug, isActive: true },
    });

    if (!plan) {
      throw new NotFoundException(`Plan "${planSlug}" not found`);
    }

    // Mock Stripe checkout — replace with real Stripe integration
    const price = billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
    const mockUrl = `https://checkout.stripe.com/pay/mock?plan=${plan.slug}&cycle=${billingCycle}&price=${price}&org=${organizationId}`;

    return { url: mockUrl };
  }

  async createBillingPortalSession(
    organizationId: string,
  ): Promise<{ url: string }> {
    // Mock Stripe billing portal — replace with real Stripe integration
    const mockUrl = `https://billing.stripe.com/session/mock?org=${organizationId}`;

    return { url: mockUrl };
  }
}
