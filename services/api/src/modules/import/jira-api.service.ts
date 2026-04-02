import { Injectable, Logger, BadGatewayException } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export interface JiraApiCredentials {
  baseUrl: string; // e.g. https://acme.atlassian.net
  email: string;
  apiToken: string;
}

export interface JiraApiProject {
  id: string;
  key: string;
  name: string;
  description?: string;
  projectTypeKey?: string;
  lead?: { emailAddress?: string; displayName?: string };
}

export interface JiraApiSprint {
  id: number;
  name: string;
  state: string; // 'active' | 'closed' | 'future'
  startDate?: string;
  endDate?: string;
  goal?: string;
}

export interface JiraApiIssue {
  id: string;
  key: string;
  fields: {
    summary?: string;
    description?: any;
    issuetype?: { name: string };
    priority?: { name: string };
    status?: {
      name: string;
      statusCategory?: { key: string };
    };
    assignee?: { emailAddress?: string; displayName?: string };
    reporter?: { emailAddress?: string; displayName?: string };
    created?: string;
    updated?: string;
    labels?: string[];
    customfield_10016?: number; // story points
    customfield_10020?: Array<{   // sprint (array in Jira Cloud API v3)
      id: number;
      name: string;
      state: string;
      startDate?: string;
      endDate?: string;
      goal?: string;
    }>;
    timetracking?: {
      originalEstimate?: string;
      timeSpent?: string;
      originalEstimateSeconds?: number;
      timeSpentSeconds?: number;
    };
    subtasks?: Array<{ id: string; key: string }>;
    parent?: { id: string; key: string };
    comment?: {
      comments: Array<{
        author?: { emailAddress?: string; displayName?: string };
        body?: any; // Jira ADF or plain text
        created?: string;
      }>;
    };
  };
}

export interface JiraPaginatedResponse<T> {
  startAt: number;
  maxResults: number;
  total: number;
  values?: T[];    // used by board/sprint APIs
  issues?: T[];    // used by search API
}

export interface JiraTestResult {
  ok: boolean;
  displayName?: string;
  accountId?: string;
  errorMessage?: string;
}

const REQUEST_DELAY_MS = 100; // courtesy delay between paginated requests

/**
 * Thin HTTP client for the Jira REST API v3.
 *
 * Uses Node's built-in http/https modules (no axios dependency) to keep the
 * service self-contained and avoid bundle bloat.
 *
 * All methods accept credentials explicitly — this service is stateless and
 * safe to use concurrently for different orgs.
 */
@Injectable()
export class JiraApiService {
  private readonly logger = new Logger(JiraApiService.name);

  /**
   * Make a GET request to the Jira REST API.
   * Retries once on 429 (rate limit) with a 2-second back-off.
   */
  private async get<T>(
    credentials: JiraApiCredentials,
    path: string,
    attempt = 1,
  ): Promise<T> {
    const baseToken = Buffer.from(
      `${credentials.email}:${credentials.apiToken}`,
    ).toString('base64');

    const rawUrl = credentials.baseUrl.replace(/\/$/, '') + path;
    const parsedUrl = new URL(rawUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;
    const port = parsedUrl.port
      ? parseInt(parsedUrl.port, 10)
      : isHttps
        ? 443
        : 80;

    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        Authorization: `Basic ${baseToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    };

    return new Promise((resolve, reject) => {
      const req = transport.request(options, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () => {
          if (res.statusCode === 429 && attempt === 1) {
            // Rate limited — back off and retry once
            setTimeout(() => {
              this.get<T>(credentials, path, 2)
                .then(resolve)
                .catch(reject);
            }, 2000);
            return;
          }

          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new Error(
                `Jira API ${res.statusCode}: ${body.slice(0, 200)}`,
              ),
            );
            return;
          }

          try {
            resolve(JSON.parse(body) as T);
          } catch {
            reject(new Error(`Jira API returned non-JSON: ${body.slice(0, 200)}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Jira API request timed out (15s)'));
      });
      req.end();
    });
  }

  /**
   * Verify credentials and return the authenticated user's display name.
   */
  async testConnection(
    credentials: JiraApiCredentials,
  ): Promise<JiraTestResult> {
    try {
      const result = await this.get<{
        displayName?: string;
        accountId?: string;
        emailAddress?: string;
      }>(credentials, '/rest/api/3/myself');

      return {
        ok: true,
        displayName: result.displayName,
        accountId: result.accountId,
      };
    } catch (err: any) {
      return { ok: false, errorMessage: err.message };
    }
  }

  /**
   * List all projects the authenticated user can see.
   */
  async listProjects(
    credentials: JiraApiCredentials,
  ): Promise<JiraApiProject[]> {
    const PAGE_SIZE = 50;
    const projects: JiraApiProject[] = [];
    let startAt = 0;
    let hasMore = true;

    while (hasMore) {
      const page = await this.get<{ values: JiraApiProject[]; isLast: boolean }>(
        credentials,
        `/rest/api/3/project/search?startAt=${startAt}&maxResults=${PAGE_SIZE}&expand=description,lead`,
      );

      if (Array.isArray(page.values)) {
        projects.push(...page.values);
      }

      hasMore = !page.isLast && (page.values?.length ?? 0) === PAGE_SIZE;
      startAt += PAGE_SIZE;

      if (hasMore) {
        await this.delay(REQUEST_DELAY_MS);
      }
    }

    return projects;
  }

  /**
   * Fetch all issues for a JQL query with full pagination.
   * Uses the search API which returns up to 100 issues per page.
   */
  async fetchIssuesByJql(
    credentials: JiraApiCredentials,
    jql: string,
    onPageFetched?: (fetched: number, total: number) => void,
  ): Promise<JiraApiIssue[]> {
    const PAGE_SIZE = 100;
    const FIELDS = [
      'summary',
      'description',
      'issuetype',
      'priority',
      'status',
      'assignee',
      'reporter',
      'created',
      'updated',
      'labels',
      'customfield_10016', // story points
      'customfield_10020', // sprint
      'timetracking',
      'subtasks',
      'parent',
      'comment',
    ].join(',');

    const issues: JiraApiIssue[] = [];
    let startAt = 0;
    let total = 0;

    do {
      const encoded = encodeURIComponent(jql);
      const path =
        `/rest/api/3/search?jql=${encoded}` +
        `&startAt=${startAt}` +
        `&maxResults=${PAGE_SIZE}` +
        `&fields=${FIELDS}`;

      const page = await this.get<JiraPaginatedResponse<JiraApiIssue>>(
        credentials,
        path,
      );

      total = page.total ?? 0;

      if (Array.isArray(page.issues)) {
        issues.push(...page.issues);
      }

      startAt += PAGE_SIZE;

      if (onPageFetched) {
        onPageFetched(issues.length, total);
      }

      this.logger.debug(
        `Fetched ${issues.length}/${total} issues (JQL: ${jql.slice(0, 60)})`,
      );

      if (issues.length < total) {
        await this.delay(REQUEST_DELAY_MS);
      }
    } while (issues.length < total);

    return issues;
  }

  /**
   * Extract the description as a plain-text string.
   * Handles both Jira ADF (Atlassian Document Format) and legacy plain-text
   * description fields.
   */
  extractDescriptionText(description: any): string | null {
    if (!description) return null;
    if (typeof description === 'string') return description;

    // ADF format
    if (description.type === 'doc' && Array.isArray(description.content)) {
      return this.adfToText(description);
    }

    return null;
  }

  /**
   * Naive ADF -> plaintext conversion.
   * Preserves paragraph breaks and list items without external dependencies.
   */
  private adfToText(node: any, depth = 0): string {
    if (!node) return '';

    if (node.type === 'text') {
      return node.text || '';
    }

    if (!Array.isArray(node.content)) return '';

    const parts: string[] = node.content.map((child: any) =>
      this.adfToText(child, depth + 1),
    );

    switch (node.type) {
      case 'paragraph':
        return parts.join('') + '\n';
      case 'heading':
        return parts.join('') + '\n';
      case 'bulletList':
      case 'orderedList':
        return parts.join('');
      case 'listItem':
        return '- ' + parts.join('').trim() + '\n';
      case 'codeBlock':
        return '```\n' + parts.join('') + '```\n';
      case 'blockquote':
        return '> ' + parts.join('');
      case 'hardBreak':
        return '\n';
      default:
        return parts.join('');
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
