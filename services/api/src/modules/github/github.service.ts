import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { GitHubConnection } from './entities/github-connection.entity';
import { GitHubEvent } from './entities/github-event.entity';
import { Issue } from '../issues/entities/issue.entity';
import { ConnectGithubDto } from './dto/connect-github.dto';

export interface GitHubRepo {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  description: string | null;
  updatedAt: string;
}

/** Regex to find issue keys like QBP-123 in text */
const ISSUE_KEY_REGEX = /\b([A-Z]{2,10}-\d+)\b/g;

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(
    @InjectRepository(GitHubConnection)
    private connectionRepository: Repository<GitHubConnection>,
    @InjectRepository(GitHubEvent)
    private eventRepository: Repository<GitHubEvent>,
    @InjectRepository(Issue)
    private issueRepository: Repository<Issue>,
    private configService: ConfigService,
  ) {}

  /**
   * Connect a GitHub repository to a project.
   * Automatically registers a webhook on the GitHub repo.
   */
  async connectRepo(
    projectId: string,
    organizationId: string,
    dto: ConnectGithubDto,
  ): Promise<GitHubConnection> {
    // Check if a connection already exists for this project
    const existing = await this.connectionRepository.findOne({
      where: { projectId },
    });
    if (existing) {
      throw new ConflictException(
        'A GitHub connection already exists for this project. Disconnect first.',
      );
    }

    // Generate a unique webhook secret for this connection
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const connection = this.connectionRepository.create({
      projectId,
      organizationId,
      repoOwner: dto.repoOwner,
      repoName: dto.repoName,
      accessTokenEncrypted: dto.accessToken || null,
      webhookSecret,
    });

    const saved = await this.connectionRepository.save(connection);

    // Auto-register webhook on GitHub
    if (dto.accessToken) {
      try {
        const webhookId = await this.registerWebhook(
          dto.accessToken,
          dto.repoOwner,
          dto.repoName,
          webhookSecret,
        );
        if (webhookId) {
          saved.webhookId = webhookId;
          await this.connectionRepository.save(saved);
          this.logger.log(
            `Webhook registered on ${dto.repoOwner}/${dto.repoName} (ID: ${webhookId})`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to auto-register webhook on ${dto.repoOwner}/${dto.repoName}: ${error.message}. ` +
          `User can manually set up the webhook at: POST ${this.getWebhookUrl()}`,
        );
        // Don't fail the connection — webhook can be set up manually
      }
    }

    return saved;
  }

  /**
   * Disconnect (delete) the GitHub connection for a project.
   * Automatically removes the webhook from GitHub.
   */
  async disconnectRepo(projectId: string, organizationId: string): Promise<void> {
    const connection = await this.connectionRepository.findOne({
      where: { projectId, organizationId },
    });
    if (!connection) {
      throw new NotFoundException('No GitHub connection found for this project');
    }

    // Auto-delete webhook from GitHub
    if (connection.webhookId && connection.accessTokenEncrypted) {
      try {
        await this.deleteWebhook(
          connection.accessTokenEncrypted,
          connection.repoOwner,
          connection.repoName,
          connection.webhookId,
        );
        this.logger.log(
          `Webhook removed from ${connection.repoOwner}/${connection.repoName} (ID: ${connection.webhookId})`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to remove webhook from ${connection.repoOwner}/${connection.repoName}: ${error.message}`,
        );
        // Don't fail the disconnect — just clean up our side
      }
    }

    await this.connectionRepository.remove(connection);
  }

  /**
   * Return the current GitHub connection status for a project, or null.
   */
  async getConnectionStatus(
    projectId: string,
    organizationId: string,
  ): Promise<(GitHubConnection & { webhookActive: boolean }) | null> {
    const conn = await this.connectionRepository.findOne({
      where: { projectId, organizationId },
    });
    if (!conn) return null;
    return {
      ...conn,
      webhookActive: !!conn.webhookId,
    };
  }

  /**
   * Return all GitHub events linked to a specific issue.
   */
  async getEventsForIssue(
    issueId: string,
    organizationId: string,
  ): Promise<GitHubEvent[]> {
    const issue = await this.issueRepository.findOne({
      where: { id: issueId, organizationId },
    });
    if (!issue) {
      throw new NotFoundException('Issue not found');
    }

    return this.eventRepository.find({
      where: { issueId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Process an incoming webhook event from GitHub.
   */
  async processWebhookEvent(
    connectionId: string,
    eventType: string,
    payload: Record<string, any>,
  ): Promise<GitHubEvent[]> {
    const connection = await this.connectionRepository.findOne({
      where: { id: connectionId },
    });
    if (!connection) {
      this.logger.warn(`GitHub connection ${connectionId} not found, skipping event`);
      return [];
    }

    const events: GitHubEvent[] = [];

    if (eventType === 'pull_request') {
      const pr = payload.pull_request;
      if (!pr) return [];

      const action = payload.action;
      let mappedType: string;
      if (action === 'opened' || action === 'reopened') {
        mappedType = 'pr_opened';
      } else if (action === 'closed' && pr.merged) {
        mappedType = 'pr_merged';
      } else if (action === 'closed') {
        mappedType = 'pr_closed';
      } else {
        return [];
      }

      const textToSearch = `${pr.title || ''} ${pr.body || ''} ${pr.head?.ref || ''}`;
      const issueKeys = this.extractIssueKeys(textToSearch);

      if (issueKeys.length === 0) {
        const event = this.eventRepository.create({
          githubConnectionId: connectionId,
          eventType: mappedType,
          prNumber: pr.number,
          prTitle: pr.title,
          prUrl: pr.html_url,
          branchName: pr.head?.ref || null,
          author: pr.user?.login || null,
          metadata: { action, prState: pr.state, merged: pr.merged || false },
        });
        events.push(await this.eventRepository.save(event));
      } else {
        for (const key of issueKeys) {
          const issue = await this.findIssueByKey(key, connection.organizationId);
          const event = this.eventRepository.create({
            githubConnectionId: connectionId,
            issueId: issue?.id || null,
            eventType: mappedType,
            prNumber: pr.number,
            prTitle: pr.title,
            prUrl: pr.html_url,
            branchName: pr.head?.ref || null,
            author: pr.user?.login || null,
            metadata: {
              action,
              prState: pr.state,
              merged: pr.merged || false,
              issueKey: key,
            },
          });
          events.push(await this.eventRepository.save(event));
        }
      }
    } else if (eventType === 'push') {
      const commits = payload.commits || [];
      const branch = payload.ref ? payload.ref.replace('refs/heads/', '') : null;

      for (const commit of commits) {
        const textToSearch = `${commit.message || ''}`;
        const issueKeys = this.extractIssueKeys(textToSearch);

        if (issueKeys.length === 0) {
          const event = this.eventRepository.create({
            githubConnectionId: connectionId,
            eventType: 'commit',
            commitSha: commit.id || null,
            branchName: branch,
            author: commit.author?.username || commit.author?.name || null,
            metadata: { message: commit.message },
          });
          events.push(await this.eventRepository.save(event));
        } else {
          for (const key of issueKeys) {
            const issue = await this.findIssueByKey(key, connection.organizationId);
            const event = this.eventRepository.create({
              githubConnectionId: connectionId,
              issueId: issue?.id || null,
              eventType: 'commit',
              commitSha: commit.id || null,
              branchName: branch,
              author: commit.author?.username || commit.author?.name || null,
              metadata: { message: commit.message, issueKey: key },
            });
            events.push(await this.eventRepository.save(event));
          }
        }
      }
    }

    return events;
  }

  /**
   * Look up an issue by its key (e.g. "QBP-123") within an organization.
   */
  async findIssueByKey(key: string, organizationId: string): Promise<Issue | null> {
    return this.issueRepository.findOne({
      where: { key, organizationId },
    });
  }

  /**
   * Find a connection by its ID.
   */
  async findConnectionById(id: string): Promise<GitHubConnection | null> {
    return this.connectionRepository.findOne({
      where: { id },
    });
  }

  /**
   * Find a connection by repo owner + repo name.
   */
  async findConnectionByRepo(
    repoOwner: string,
    repoName: string,
  ): Promise<GitHubConnection | null> {
    return this.connectionRepository.findOne({
      where: { repoOwner, repoName },
    });
  }

  /**
   * Find ALL connections for a repo (multi-tenant: multiple orgs can connect the same repo).
   */
  async findAllConnectionsByRepo(
    repoOwner: string,
    repoName: string,
  ): Promise<GitHubConnection[]> {
    return this.connectionRepository.find({
      where: { repoOwner, repoName },
    });
  }

  // ── GitHub OAuth for repo picker ──

  /**
   * Build the GitHub OAuth authorize URL with `repo` scope.
   */
  getOAuthUrl(redirectUri: string): string {
    const clientId = this.configService.get<string>('oauth.github.clientId');
    if (!clientId) {
      throw new BadRequestException('GITHUB_CLIENT_ID is not configured');
    }
    const state = Buffer.from(redirectUri).toString('base64url');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'repo,read:user',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange an OAuth code for an access token and return the user's repos.
   */
  async exchangeCodeForRepos(
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string; repos: GitHubRepo[] }> {
    const clientId = this.configService.get<string>('oauth.github.clientId');
    const clientSecret = this.configService.get<string>('oauth.github.clientSecret');

    if (!clientId || !clientSecret) {
      throw new BadRequestException('GitHub OAuth credentials are not configured');
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
    });

    const tokenData: any = await tokenRes.json();
    if (tokenData.error) {
      throw new BadRequestException(tokenData.error_description || 'GitHub OAuth failed');
    }

    const accessToken: string = tokenData.access_token;

    const reposRes = await fetch(
      'https://api.github.com/user/repos?sort=updated&per_page=100&type=all',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    const reposData: any[] = await reposRes.json();
    if (!Array.isArray(reposData)) {
      throw new BadRequestException('Failed to fetch GitHub repositories');
    }

    const repos: GitHubRepo[] = reposData.map((r) => ({
      id: r.id,
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      description: r.description || null,
      updatedAt: r.updated_at,
    }));

    return { accessToken, repos };
  }

  // ── GitHub Webhook Management (auto-register/delete) ──

  /**
   * Get the public webhook URL for this BoardUpscale instance.
   */
  private getWebhookUrl(): string {
    const frontendUrl = this.configService.get<string>('app.frontendUrl') || '';
    // The API is typically at the same domain or a different port
    // Use FRONTEND_URL domain with /api prefix for production
    const baseUrl = frontendUrl.replace(/\/$/, '');
    return `${baseUrl}/api/github/webhook`;
  }

  /**
   * Register a webhook on a GitHub repository via the GitHub REST API.
   * Returns the webhook ID for later deletion.
   */
  private async registerWebhook(
    accessToken: string,
    repoOwner: string,
    repoName: string,
    webhookSecret: string,
  ): Promise<number | null> {
    const webhookUrl = this.getWebhookUrl();

    this.logger.log(
      `Registering webhook on ${repoOwner}/${repoName} → ${webhookUrl}`,
    );

    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/hooks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          name: 'web',
          active: true,
          events: ['push', 'pull_request'],
          config: {
            url: webhookUrl,
            content_type: 'json',
            secret: webhookSecret,
            insecure_ssl: '0',
          },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `GitHub API returned ${response.status}: ${errorBody}`,
      );
    }

    const hookData: any = await response.json();
    return hookData.id || null;
  }

  /**
   * Delete a webhook from a GitHub repository.
   */
  private async deleteWebhook(
    accessToken: string,
    repoOwner: string,
    repoName: string,
    webhookId: number,
  ): Promise<void> {
    this.logger.log(
      `Deleting webhook ${webhookId} from ${repoOwner}/${repoName}`,
    );

    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/hooks/${webhookId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (!response.ok && response.status !== 404) {
      const errorBody = await response.text();
      throw new Error(
        `GitHub API returned ${response.status}: ${errorBody}`,
      );
    }
  }

  /**
   * Verify webhook is still active on GitHub. Used for status checks.
   */
  async verifyWebhook(connectionId: string): Promise<boolean> {
    const connection = await this.connectionRepository.findOne({
      where: { id: connectionId },
    });
    if (!connection?.webhookId || !connection?.accessTokenEncrypted) {
      return false;
    }

    try {
      const response = await fetch(
        `https://api.github.com/repos/${connection.repoOwner}/${connection.repoName}/hooks/${connection.webhookId}`,
        {
          headers: {
            Authorization: `Bearer ${connection.accessTokenEncrypted}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Extract unique issue keys from a string.
   */
  private extractIssueKeys(text: string): string[] {
    const matches = text.match(ISSUE_KEY_REGEX);
    if (!matches) return [];
    return [...new Set(matches)];
  }
}
