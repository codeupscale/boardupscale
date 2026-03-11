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

    // Determine which connection this webhook is for.
    // GitHub sends the repository info in the payload.
    const repoFullName = body?.repository?.full_name;
    if (!repoFullName) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        message: 'Missing repository information in payload',
      });
    }

    const [repoOwner, repoName] = repoFullName.split('/');
    const connection = await this.githubService.findConnectionByRepo(
      repoOwner,
      repoName,
    );

    if (!connection) {
      this.logger.warn(
        `No GitHub connection found for repo ${repoFullName}, ignoring webhook`,
      );
      return res.status(HttpStatus.OK).json({
        message: 'No connection found for this repository',
      });
    }

    // Verify webhook signature if a secret is configured
    if (connection.webhookSecret && rawBody) {
      const expectedSignature =
        'sha256=' +
        crypto
          .createHmac('sha256', connection.webhookSecret)
          .update(rawBody)
          .digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature || ''),
        Buffer.from(expectedSignature),
      );

      if (!isValid) {
        this.logger.warn(
          `Invalid webhook signature for connection ${connection.id}`,
        );
        return res.status(HttpStatus.UNAUTHORIZED).json({
          message: 'Invalid webhook signature',
        });
      }
    }

    // Only process events we care about
    const supportedEvents = ['pull_request', 'push'];
    if (!supportedEvents.includes(githubEvent)) {
      return res.status(HttpStatus.OK).json({
        message: `Event type "${githubEvent}" is not processed`,
      });
    }

    try {
      const events = await this.githubService.processWebhookEvent(
        connection.id,
        githubEvent,
        body,
      );

      this.logger.log(
        `Processed GitHub ${githubEvent} event for ${repoFullName}: created ${events.length} event(s)`,
      );

      return res.status(HttpStatus.OK).json({
        message: 'Webhook processed',
        eventsCreated: events.length,
      });
    } catch (error) {
      this.logger.error(
        `Error processing GitHub webhook: ${error.message}`,
        error.stack,
      );
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Error processing webhook',
      });
    }
  }
}
