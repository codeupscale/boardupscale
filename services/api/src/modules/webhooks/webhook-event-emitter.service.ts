import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WebhooksService } from './webhooks.service';

@Injectable()
export class WebhookEventEmitter {
  private readonly logger = new Logger(WebhookEventEmitter.name);

  constructor(
    private webhooksService: WebhooksService,
    @InjectQueue('webhooks')
    private webhooksQueue: Queue,
  ) {}

  /**
   * Emit a webhook event. Finds all matching webhooks for the given org/project/event,
   * creates delivery records, and queues BullMQ jobs for the worker to process.
   */
  async emit(
    organizationId: string,
    projectId: string | null,
    eventType: string,
    payload: Record<string, any>,
  ): Promise<void> {
    try {
      const webhooks = await this.webhooksService.findWebhooksForEvent(
        organizationId,
        projectId,
        eventType,
      );

      if (webhooks.length === 0) {
        return;
      }

      this.logger.log(
        `Emitting ${eventType} to ${webhooks.length} webhook(s) (org=${organizationId})`,
      );

      for (const webhook of webhooks) {
        try {
          const delivery = await this.webhooksService.createDelivery(
            webhook.id,
            eventType,
            payload,
          );

          await this.webhooksQueue.add(
            'deliver',
            {
              deliveryId: delivery.id,
              webhookId: webhook.id,
              url: webhook.url,
              secret: webhook.secret,
              headers: webhook.headers,
              eventType,
              payload,
            },
            {
              attempts: 1, // We handle retries manually in the worker
              removeOnComplete: { count: 500 },
              removeOnFail: { count: 1000 },
            },
          );
        } catch (err) {
          this.logger.error(
            `Failed to queue webhook delivery for webhook ${webhook.id}: ${err.message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Failed to emit webhook event ${eventType}: ${err.message}`,
      );
    }
  }
}
