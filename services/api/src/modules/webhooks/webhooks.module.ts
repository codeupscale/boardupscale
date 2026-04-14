import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookEventEmitter } from './webhook-event-emitter.service';
import { Webhook } from './entities/webhook.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Webhook, WebhookDelivery]),
    BullModule.registerQueue({
      name: 'webhooks',
    }),
    PermissionsModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookEventEmitter],
  exports: [WebhooksService, WebhookEventEmitter],
})
export class WebhooksModule {}
