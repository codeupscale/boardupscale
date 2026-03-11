import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgId } from '../../common/decorators/org-id.decorator';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Get all active billing plans (public)' })
  async getPlans() {
    const data = await this.billingService.getPlans();
    return { data };
  }

  @Get('subscription')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current organization subscription' })
  async getSubscription(@OrgId() organizationId: string) {
    const data = await this.billingService.getSubscription(organizationId);
    return { data };
  }

  @Get('usage')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get organization usage stats' })
  async getUsage(@OrgId() organizationId: string) {
    const data = await this.billingService.getUsage(organizationId);
    return { data };
  }

  @Post('checkout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a Stripe checkout session' })
  async createCheckout(
    @OrgId() organizationId: string,
    @Body() body: { planSlug: string; billingCycle: 'monthly' | 'yearly' },
  ) {
    const data = await this.billingService.createCheckoutSession(
      organizationId,
      body.planSlug,
      body.billingCycle,
    );
    return { data };
  }

  @Post('portal')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a Stripe billing portal session' })
  async createPortal(@OrgId() organizationId: string) {
    const data = await this.billingService.createBillingPortalSession(organizationId);
    return { data };
  }
}
