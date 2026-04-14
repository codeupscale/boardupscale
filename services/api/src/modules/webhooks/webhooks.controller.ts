import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { WebhookEventEmitter } from './webhook-event-emitter.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';

@ApiTags('webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class WebhooksController {
  constructor(
    private webhooksService: WebhooksService,
    private webhookEventEmitter: WebhookEventEmitter,
  ) {}

  @Post('projects/:projectId/webhooks')
  @RequirePermission('webhook', 'create')
  @ApiOperation({ summary: 'Create a webhook for a project' })
  async create(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateWebhookDto,
  ) {
    dto.projectId = projectId;
    return this.webhooksService.create(dto, organizationId, user.id);
  }

  @Get('projects/:projectId/webhooks')
  @ApiOperation({ summary: 'List webhooks for a project' })
  async findAllForProject(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @OrgId() organizationId: string,
  ) {
    const webhooks = await this.webhooksService.findAll(organizationId, projectId);
    return { data: webhooks };
  }

  @Get('webhooks/:id')
  @ApiOperation({ summary: 'Get a webhook by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @OrgId() organizationId: string) {
    return this.webhooksService.findByIdAndOrg(id, organizationId);
  }

  @Put('webhooks/:id')
  @RequirePermission('webhook', 'update')
  @ApiOperation({ summary: 'Update a webhook' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.webhooksService.updateWithOrg(id, organizationId, dto);
  }

  @Delete('webhooks/:id')
  @RequirePermission('webhook', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a webhook' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @OrgId() organizationId: string) {
    await this.webhooksService.deleteWithOrg(id, organizationId);
  }

  @Post('webhooks/:id/test')
  @RequirePermission('webhook', 'manage')
  @ApiOperation({ summary: 'Send a test payload to a webhook' })
  async test(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    const webhook = await this.webhooksService.findById(id);

    const testPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook delivery from Boardupscale',
        webhookId: webhook.id,
        webhookName: webhook.name,
      },
    };

    // Create a delivery record and queue it
    await this.webhookEventEmitter.emit(
      webhook.organizationId,
      webhook.projectId,
      'webhook.test',
      testPayload,
    );

    return { message: 'Test webhook queued for delivery' };
  }

  @Get('webhooks/:id/deliveries')
  @ApiOperation({ summary: 'Get delivery history for a webhook' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getDeliveries(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    // Ensure webhook exists
    await this.webhooksService.findById(id);

    const result = await this.webhooksService.getDeliveries(
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
    return {
      data: result.items,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      },
    };
  }

  @Post('webhook-deliveries/:id/retry')
  @RequirePermission('webhook', 'manage')
  @ApiOperation({ summary: 'Retry a failed webhook delivery' })
  async retryDelivery(@Param('id', ParseUUIDPipe) id: string) {
    const delivery = await this.webhooksService.retryDelivery(id);

    // Re-queue the delivery job
    const webhook = await this.webhooksService.findById(delivery.webhookId);

    await this.webhookEventEmitter.emit(
      webhook.organizationId,
      webhook.projectId,
      delivery.eventType,
      delivery.payload,
    );

    return delivery;
  }
}
