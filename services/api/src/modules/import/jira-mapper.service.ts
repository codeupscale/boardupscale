import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

/**
 * Represents a parsed Jira project from the export JSON.
 */
export interface JiraProject {
  key: string;
  name: string;
  description?: string;
  lead?: string;
  issueTypes?: Array<{ name: string }>;
}

/**
 * Represents a parsed Jira issue from the export JSON.
 */
export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description?: string;
    issuetype?: { name: string };
    priority?: { name: string };
    status?: {
      name: string;
      statusCategory?: { key: string };
    };
    assignee?: { emailAddress: string; displayName: string };
    reporter?: { emailAddress: string; displayName: string };
    created?: string;
    updated?: string;
    labels?: string[];
    components?: Array<{ name: string }>;
    fixVersions?: Array<{ name: string }>;
    customfield_10016?: number; // Story points
    timetracking?: {
      originalEstimate?: string;
      timeSpent?: string;
      originalEstimateSeconds?: number;
      timeSpentSeconds?: number;
    };
    subtasks?: Array<{ key: string }>;
    issuelinks?: Array<{
      type: { name: string; inward: string; outward: string };
      inwardIssue?: { key: string };
      outwardIssue?: { key: string };
    }>;
    comment?: {
      comments: Array<{
        author: { emailAddress: string; displayName: string };
        body: string;
        created: string;
      }>;
    };
    parent?: { key: string };
    [key: string]: any;
  };
}

/**
 * Represents the full Jira export JSON structure.
 */
export interface JiraExport {
  projects?: JiraProject[];
  issues?: JiraIssue[];
}

/**
 * Mapped issue ready for insertion into Boardupscale.
 */
export interface MappedIssue {
  jiraKey: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  statusCategory: string;
  statusName: string;
  assigneeEmail: string | null;
  reporterEmail: string | null;
  labels: string[];
  storyPoints: number | null;
  timeEstimate: number | null;
  timeSpent: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  parentKey: string | null;
  subtaskKeys: string[];
  comments: Array<{
    authorEmail: string | null;
    body: string;
    createdAt: string;
  }>;
}

/**
 * Import preview summary returned before starting the actual import.
 */
export interface ImportPreview {
  projects: Array<{ key: string; name: string; issueCount: number }>;
  totalIssues: number;
  issueTypes: Record<string, number>;
  priorities: Record<string, number>;
  statuses: Record<string, number>;
  users: {
    found: string[];
    matched: string[];
    unmatched: string[];
  };
}

@Injectable()
export class JiraMapperService {
  private readonly logger = new Logger(JiraMapperService.name);

  /**
   * Jira issue type name -> Boardupscale issue type.
   */
  private static readonly ISSUE_TYPE_MAP: Record<string, string> = {
    story: 'story',
    task: 'task',
    bug: 'bug',
    epic: 'epic',
    subtask: 'subtask',
    'sub-task': 'subtask',
    'new feature': 'story',
    improvement: 'story',
    'technical task': 'task',
  };

  /**
   * Jira priority name (lowercased) -> Boardupscale priority.
   */
  private static readonly PRIORITY_MAP: Record<string, string> = {
    highest: 'critical',
    high: 'high',
    medium: 'medium',
    low: 'low',
    lowest: 'low',
    blocker: 'critical',
    critical: 'critical',
    major: 'high',
    minor: 'low',
    trivial: 'low',
  };

  /**
   * Jira status category key -> Boardupscale status category.
   */
  private static readonly STATUS_CATEGORY_MAP: Record<string, string> = {
    new: 'todo',
    undefined: 'todo',
    indeterminate: 'in_progress',
    done: 'done',
  };

  /**
   * Status category -> default color in Boardupscale.
   */
  private static readonly STATUS_CATEGORY_COLORS: Record<string, string> = {
    todo: '#6B7280',
    in_progress: '#3B82F6',
    done: '#10B981',
  };

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Validate and parse the raw JSON into a JiraExport structure.
   * Throws if the structure is not valid.
   */
  parseExport(raw: any): JiraExport {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid Jira export: expected a JSON object');
    }

    const data: JiraExport = {
      projects: [],
      issues: [],
    };

    if (Array.isArray(raw.projects)) {
      data.projects = raw.projects;
    }

    if (Array.isArray(raw.issues)) {
      data.issues = raw.issues;
    }

    if (data.projects.length === 0 && data.issues.length === 0) {
      throw new Error(
        'Invalid Jira export: no projects or issues found. Expected { projects: [...], issues: [...] }',
      );
    }

    return data;
  }

  /**
   * Map a Jira issue type name to a Boardupscale type.
   */
  mapIssueType(jiraTypeName: string | undefined): string {
    if (!jiraTypeName) return 'task';
    const key = jiraTypeName.toLowerCase().trim();
    return JiraMapperService.ISSUE_TYPE_MAP[key] || 'task';
  }

  /**
   * Map a Jira priority name to a Boardupscale priority.
   */
  mapPriority(jiraPriorityName: string | undefined): string {
    if (!jiraPriorityName) return 'medium';
    const key = jiraPriorityName.toLowerCase().trim();
    return JiraMapperService.PRIORITY_MAP[key] || 'medium';
  }

  /**
   * Map a Jira status category key to a Boardupscale status category.
   */
  mapStatusCategory(jiraCategoryKey: string | undefined): string {
    if (!jiraCategoryKey) return 'todo';
    const key = jiraCategoryKey.toLowerCase().trim();
    return JiraMapperService.STATUS_CATEGORY_MAP[key] || 'todo';
  }

  /**
   * Get the color for a Boardupscale status category.
   */
  getStatusColor(category: string): string {
    return JiraMapperService.STATUS_CATEGORY_COLORS[category] || '#6B7280';
  }

  /**
   * Parse Jira time string (e.g., "3h 30m", "1d 2h") into seconds.
   */
  parseTimeToSeconds(timeStr: string | undefined | null): number | null {
    if (!timeStr) return null;
    let totalSeconds = 0;
    const dayMatch = timeStr.match(/(\d+)\s*d/);
    const hourMatch = timeStr.match(/(\d+)\s*h/);
    const minMatch = timeStr.match(/(\d+)\s*m/);
    if (dayMatch) totalSeconds += parseInt(dayMatch[1], 10) * 8 * 3600; // 1 day = 8 hours
    if (hourMatch) totalSeconds += parseInt(hourMatch[1], 10) * 3600;
    if (minMatch) totalSeconds += parseInt(minMatch[1], 10) * 60;
    return totalSeconds > 0 ? totalSeconds : null;
  }

  /**
   * Map a single Jira issue to the Boardupscale-ready structure.
   */
  mapIssue(jiraIssue: JiraIssue): MappedIssue {
    const fields = (jiraIssue.fields || {}) as JiraIssue['fields'];

    const parentKey = fields.parent?.key || null;
    const isSubtask =
      fields.issuetype?.name?.toLowerCase() === 'sub-task' ||
      fields.issuetype?.name?.toLowerCase() === 'subtask';

    // Determine time values — prefer seconds if available, fall back to string parsing
    const timeEstimate =
      fields.timetracking?.originalEstimateSeconds != null
        ? fields.timetracking.originalEstimateSeconds
        : this.parseTimeToSeconds(fields.timetracking?.originalEstimate);

    const timeSpent =
      fields.timetracking?.timeSpentSeconds != null
        ? fields.timetracking.timeSpentSeconds
        : this.parseTimeToSeconds(fields.timetracking?.timeSpent);

    return {
      jiraKey: jiraIssue.key,
      title: fields.summary || jiraIssue.key,
      description: fields.description || null,
      type: isSubtask ? 'subtask' : this.mapIssueType(fields.issuetype?.name),
      priority: this.mapPriority(fields.priority?.name),
      statusCategory: this.mapStatusCategory(fields.status?.statusCategory?.key),
      statusName: fields.status?.name || 'To Do',
      assigneeEmail: fields.assignee?.emailAddress || null,
      reporterEmail: fields.reporter?.emailAddress || null,
      labels: Array.isArray(fields.labels) ? fields.labels : [],
      storyPoints:
        typeof fields.customfield_10016 === 'number'
          ? fields.customfield_10016
          : null,
      timeEstimate,
      timeSpent: timeSpent || 0,
      createdAt: fields.created || null,
      updatedAt: fields.updated || null,
      parentKey: parentKey,
      subtaskKeys: Array.isArray(fields.subtasks)
        ? fields.subtasks.map((s) => s.key)
        : [],
      comments: Array.isArray(fields.comment?.comments)
        ? fields.comment.comments.map((c) => ({
            authorEmail: c.author?.emailAddress || null,
            body: c.body || '',
            createdAt: c.created || new Date().toISOString(),
          }))
        : [],
    };
  }

  /**
   * Map all issues from the Jira export.
   */
  mapAllIssues(data: JiraExport): MappedIssue[] {
    if (!data.issues) return [];
    return data.issues.map((issue) => this.mapIssue(issue));
  }

  /**
   * Extract unique email addresses from Jira issues.
   */
  extractEmails(data: JiraExport): string[] {
    const emailSet = new Set<string>();

    for (const issue of data.issues || []) {
      const fields = (issue.fields || {}) as JiraIssue['fields'];
      if (fields.assignee?.emailAddress) {
        emailSet.add(fields.assignee.emailAddress.toLowerCase());
      }
      if (fields.reporter?.emailAddress) {
        emailSet.add(fields.reporter.emailAddress.toLowerCase());
      }
      if (fields.comment?.comments) {
        for (const comment of fields.comment.comments) {
          if (comment.author?.emailAddress) {
            emailSet.add(comment.author.emailAddress.toLowerCase());
          }
        }
      }
    }

    return Array.from(emailSet);
  }

  /**
   * Match Jira user emails to existing Boardupscale users in the organization.
   * Returns a map: email (lowercase) -> userId.
   */
  async matchUsers(
    emails: string[],
    organizationId: string,
  ): Promise<Record<string, string>> {
    if (emails.length === 0) return {};

    const users = await this.userRepository.find({
      where: { organizationId, isActive: true },
      select: ['id', 'email'],
    });

    const emailToUserId: Record<string, string> = {};
    for (const user of users) {
      emailToUserId[user.email.toLowerCase()] = user.id;
    }

    const matched: Record<string, string> = {};
    for (const email of emails) {
      const lower = email.toLowerCase();
      if (emailToUserId[lower]) {
        matched[lower] = emailToUserId[lower];
      }
    }

    return matched;
  }

  /**
   * Extract unique Jira status names and their category mappings.
   */
  extractStatuses(
    data: JiraExport,
  ): Array<{ name: string; category: string; color: string }> {
    const statusMap = new Map<string, { category: string; color: string }>();

    for (const issue of data.issues || []) {
      const fields = (issue.fields || {}) as JiraIssue['fields'];
      const statusName = fields.status?.name;
      if (statusName && !statusMap.has(statusName)) {
        const category = this.mapStatusCategory(
          fields.status?.statusCategory?.key,
        );
        statusMap.set(statusName, {
          category,
          color: this.getStatusColor(category),
        });
      }
    }

    return Array.from(statusMap.entries()).map(([name, { category, color }]) => ({
      name,
      category,
      color,
    }));
  }

  /**
   * Build a preview summary of the import.
   */
  async buildPreview(
    data: JiraExport,
    organizationId: string,
  ): Promise<ImportPreview> {
    const emails = this.extractEmails(data);
    const matchedMap = await this.matchUsers(emails, organizationId);

    const matched = Object.keys(matchedMap);
    const unmatched = emails.filter((e) => !matchedMap[e.toLowerCase()]);

    // Count issues per project
    const projectIssueCount: Record<string, number> = {};
    const issueTypes: Record<string, number> = {};
    const priorities: Record<string, number> = {};
    const statuses: Record<string, number> = {};

    for (const issue of data.issues || []) {
      // Extract project key from issue key (e.g., "PROJ-123" -> "PROJ")
      const projectKey = issue.key?.split('-')[0] || 'UNKNOWN';
      projectIssueCount[projectKey] = (projectIssueCount[projectKey] || 0) + 1;

      const typeName = issue.fields?.issuetype?.name || 'Unknown';
      issueTypes[typeName] = (issueTypes[typeName] || 0) + 1;

      const priorityName = issue.fields?.priority?.name || 'Unknown';
      priorities[priorityName] = (priorities[priorityName] || 0) + 1;

      const statusName = issue.fields?.status?.name || 'Unknown';
      statuses[statusName] = (statuses[statusName] || 0) + 1;
    }

    const projects = (data.projects || []).map((p) => ({
      key: p.key,
      name: p.name,
      issueCount: projectIssueCount[p.key] || 0,
    }));

    // Add projects inferred from issue keys if not in the projects list
    for (const [key, count] of Object.entries(projectIssueCount)) {
      if (!projects.find((p) => p.key === key)) {
        projects.push({ key, name: key, issueCount: count });
      }
    }

    return {
      projects,
      totalIssues: (data.issues || []).length,
      issueTypes,
      priorities,
      statuses,
      users: {
        found: emails,
        matched,
        unmatched,
      },
    };
  }
}
