import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostHog } from 'posthog-node';

/**
 * PosthogService wraps posthog-node for server-side analytics.
 *
 * Completely no-op when POSTHOG_API_KEY is not set, so PostHog remains
 * optional for self-hosted / development environments.
 */
@Injectable()
export class PosthogService implements OnModuleDestroy {
  private readonly logger = new Logger(PosthogService.name);
  private client: PostHog | null = null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('POSTHOG_API_KEY');
    const host = this.configService.get<string>('POSTHOG_HOST');

    if (apiKey) {
      this.client = new PostHog(apiKey, {
        host: host || 'https://us.i.posthog.com',
        flushAt: 20,
        flushInterval: 10_000,
      });
      this.logger.log('PostHog analytics initialized');
    } else {
      this.logger.debug('PostHog analytics disabled (POSTHOG_API_KEY not set)');
    }
  }

  /**
   * Identify a user with optional properties (e.g. email, org, role).
   */
  identify(
    userId: string,
    properties?: Record<string, string | number | boolean>,
  ): void {
    if (!this.client) return;

    this.client.identify({
      distinctId: userId,
      properties,
    });
  }

  /**
   * Capture an analytics event for a user.
   */
  capture(
    userId: string,
    event: string,
    properties?: Record<string, string | number | boolean>,
  ): void {
    if (!this.client) return;

    this.client.capture({
      distinctId: userId,
      event,
      properties,
    });
  }

  /**
   * Flush pending events and shut down the client gracefully.
   */
  async shutdown(): Promise<void> {
    if (!this.client) return;

    await this.client.shutdown();
    this.logger.log('PostHog client shut down');
  }

  async onModuleDestroy(): Promise<void> {
    await this.shutdown();
  }
}
