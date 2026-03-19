import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  HttpStatus,
  Logger,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { GithubService } from './github.service';

@ApiTags('github-webhook')
@Controller('github')
export class GithubWebhookController {
  private readonly logger = new Logger(GithubWebhookController.name);

  constructor(private readonly githubService: GithubService) {}

  @Post('webhook')
  @ApiOperation({ summary: 'Receive GitHub webhook events' })
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') githubEvent: string,
    @Headers('x-github-delivery') deliveryId: string,
  ) {
    const body = req.body;
    const rawBody = req.rawBody;

    if (!githubEvent) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        message: 'Missing X-GitHub-Event header',
      });
    }

    // Determine which connection(s) this webhook is for.
    const repoFullName = body?.repository?.full_name;
    if (!repoFullName) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        message: 'Missing repository information in payload',
      });
    }

    const [repoOwner, repoName] = repoFullName.split('/');

    // Multi-tenant: find ALL connections for this repo (multiple orgs can connect the same repo)
    const connections = await this.githubService.findAllConnectionsByRepo(
      repoOwner,
      repoName,
    );

    if (!connections.length) {
      this.logger.warn(
        `No GitHub connection found for repo ${repoFullName}, ignoring webhook`,
      );
      return res.status(HttpStatus.OK).json({
        message: 'No connection found for this repository',
      });
    }

    // Only process events we care about
    const supportedEvents = ['pull_request', 'push'];
    if (!supportedEvents.includes(githubEvent)) {
      return res.status(HttpStatus.OK).json({
        message: `Event type "${githubEvent}" is not processed`,
      });
    }

    // Fan out: process the event for each connection (each org gets its own events)
    let totalEventsCreated = 0;
    let processedConnections = 0;

    for (const connection of connections) {
      // Verify webhook signature per connection (each has its own secret)
      if (connection.webhookSecret && rawBody && signature) {
        const expectedSignature =
          'sha256=' +
          crypto
            .createHmac('sha256', connection.webhookSecret)
            .update(rawBody)
            .digest('hex');

        const sigBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);

        if (
          sigBuffer.length !== expectedBuffer.length ||
          !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
        ) {
          // Signature doesn't match this connection's secret — skip it, try others
          continue;
        }
      }

      try {
        const events = await this.githubService.processWebhookEvent(
          connection.id,
          githubEvent,
          body,
        );
        totalEventsCreated += events.length;
        processedConnections++;
      } catch (error) {
        this.logger.error(
          `Error processing GitHub webhook for connection ${connection.id} (org: ${connection.organizationId}): ${error.message}`,
          error.stack,
        );
      }
    }

    if (processedConnections === 0) {
      this.logger.warn(
        `Webhook signature did not match any connection for ${repoFullName}`,
      );
      return res.status(HttpStatus.UNAUTHORIZED).json({
        message: 'Invalid webhook signature',
      });
    }

    this.logger.log(
      `Processed GitHub ${githubEvent} for ${repoFullName}: ${totalEventsCreated} event(s) across ${processedConnections} connection(s)`,
    );

    return res.status(HttpStatus.OK).json({
      message: 'Webhook processed',
      eventsCreated: totalEventsCreated,
      connectionsProcessed: processedConnections,
    });
  }
}
