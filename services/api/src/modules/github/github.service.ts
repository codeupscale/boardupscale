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
   */
  async connectRepo(
    projectId: string,
    organizationId: string,
    dto: ConnectGithubDto,
  ): Promise<GitHubConnection> {
    // Check if a connection already exists for this project (UNIQUE constraint on project_id)
    const existing = await this.connectionRepository.findOne({
      where: { projectId },
    });
    if (existing) {
      throw new ConflictException(
        'A GitHub connection already exists for this project. Disconnect first.',
      );
    }

    const connection = this.connectionRepository.create({
      projectId,
      organizationId,
      repoOwner: dto.repoOwner,
      repoName: dto.repoName,
      accessTokenEncrypted: dto.accessToken || null,
      webhookSecret: dto.webhookSecret || null,
    });

    return this.connectionRepository.save(connection);
  }

  /**
   * Disconnect (delete) the GitHub connection for a project.
   */
  async disconnectRepo(projectId: string, organizationId: string): Promise<void> {
    const connection = await this.connectionRepository.findOne({
      where: { projectId, organizationId },
    });
    if (!connection) {
      throw new NotFoundException('No GitHub connection found for this project');
    }
    await this.connectionRepository.remove(connection);
  }

  /**
   * Return the current GitHub connection status for a project, or null.
   */
  async getConnectionStatus(
    projectId: string,
    organizationId: string,
  ): Promise<GitHubConnection | null> {
    return this.connectionRepository.findOne({
      where: { projectId, organizationId },
    });
  }

  /**
   * Return all GitHub events linked to a specific issue.
   */
  async getEventsForIssue(
    issueId: string,
    organizationId: string,
  ): Promise<GitHubEvent[]> {
    // Verify the issue belongs to this organization
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
   * Parses PR/commit data, extracts issue keys, and saves event records.
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

      const action = payload.action; // opened, closed, merged
      let mappedType: string;
      if (action === 'opened' || action === 'reopened') {
        mappedType = 'pr_opened';
      } else if (action === 'closed' && pr.merged) {
        mappedType = 'pr_merged';
      } else if (action === 'closed') {
        mappedType = 'pr_closed';
      } else {
        // Ignore other PR actions (edited, labeled, etc.)
        return [];
      }

      // Extract issue keys from PR title and body
      const textToSearch = `${pr.title || ''} ${pr.body || ''} ${pr.head?.ref || ''}`;
      const issueKeys = this.extractIssueKeys(textToSearch);

      if (issueKeys.length === 0) {
        // Save event without issue link
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
        // Create one event per linked issue
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
          // Save commit event without issue link
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

  // ── GitHub OAuth for repo picker ──

  /**
   * Build the GitHub OAuth authorize URL with `repo` scope.
   * The redirectUri must be a frontend callback page that passes the code back.
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

    // Exchange code for access token
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

    // Fetch user's repos (sorted by recently updated, up to 100)
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

  /**
   * Extract unique issue keys from a string.
   */
  private extractIssueKeys(text: string): string[] {
    const matches = text.match(ISSUE_KEY_REGEX);
    if (!matches) return [];
    return [...new Set(matches)];
  }
}
