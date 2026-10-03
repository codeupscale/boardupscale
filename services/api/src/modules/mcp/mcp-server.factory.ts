import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { BoardsService } from '../boards/boards.service';
import { BoardQueryDto } from '../boards/dto/board-query.dto';
import { UpdateIssueDto } from '../issues/dto/update-issue.dto';
import { CommentsService } from '../comments/comments.service';
import { FilesService } from '../files/files.service';
import { GithubService } from '../github/github.service';
import { Issue } from '../issues/entities/issue.entity';
import { IssuesService } from '../issues/issues.service';
import { ProjectsService } from '../projects/projects.service';
import { SprintsService } from '../sprints/sprints.service';
import { McpAccessService } from './mcp-access.service';
import { htmlToText, plainTextToHtml, summarizePullRequests } from './mcp-format.util';
import { McpContext } from './mcp.types';

type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

const ISSUE_TYPES = ['epic', 'story', 'task', 'bug', 'subtask'] as const;
const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
const STATUS_CATEGORIES = ['todo', 'in_progress', 'done'] as const;

const issueKey = z.string().min(1).max(40).describe("Issue key, e.g. 'PROJ-42'");
const projectKey = z.string().min(1).max(64).describe("Project key, e.g. 'PROJ'");

const WRITE_NOTE = 'Requires a token with write access and issue permission in the project.';

const issueFields = {
  description: z
    .string()
    .max(50000)
    .optional()
    .describe('Plain text; blank lines separate paragraphs. Replaces the existing description.'),
  type: z.enum(ISSUE_TYPES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.string().min(1).max(100).optional().describe("Status name, e.g. 'In Progress'"),
  labels: z
    .array(z.string().min(1).max(50))
    .max(20)
    .optional()
    .describe('Replaces the existing labels'),
};

// Fields that can be cleared with null when updating.
const assignee = z.string().min(1).max(320).describe("Project member's email, or 'me'");
const sprint = z.string().min(1).max(200).describe('Sprint name or id (not completed)');
const parent = issueKey.describe("Parent issue key, e.g. 'PROJ-10'");
const storyPoints = z.number().int().min(0).max(1000);
const dueDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .describe('YYYY-MM-DD');

type IssueWriteArgs = {
  title?: string;
  description?: string;
  type?: string;
  priority?: string;
  status?: string;
  labels?: string[];
  assignee?: string | null;
  sprint?: string | null;
  parent?: string | null;
  storyPoints?: number | null;
  dueDate?: string | null;
};

function summarizeIssue(issue: Issue) {
  return {
    key: issue.key,
    title: issue.title,
    type: issue.type,
    priority: issue.priority,
    status: issue.status?.name ?? null,
    statusCategory: issue.status?.category ?? null,
    assignee: issue.assignee?.displayName ?? null,
    sprint: issue.sprint?.name ?? null,
    parent: issue.parent?.key ?? null,
    storyPoints: issue.storyPoints ?? null,
    dueDate: issue.dueDate ?? null,
    updatedAt: issue.updatedAt,
  };
}

/**
 * Builds a per-request MCP server whose tools are bound to one caller.
 * All reads go through McpAccessService, which enforces tenant + project scope.
 */
@Injectable()
export class McpServerFactory {
  private readonly logger = new Logger(McpServerFactory.name);

  constructor(
    private access: McpAccessService,
    private issuesService: IssuesService,
    private projectsService: ProjectsService,
    private commentsService: CommentsService,
    private sprintsService: SprintsService,
    private boardsService: BoardsService,
    private filesService: FilesService,
    private githubService: GithubService,
    private auditService: AuditService,
  ) {}

  /** Translate tool arguments (names, keys, emails) into issue DTO fields scoped to one project. */
  private async toIssueFields(
    ctx: McpContext,
    projectId: string,
    args: IssueWriteArgs,
  ): Promise<UpdateIssueDto> {
    const dto: UpdateIssueDto = {};
    if (args.title !== undefined) dto.title = args.title;
    if (args.description !== undefined) {
      dto.description = args.description.trim() ? plainTextToHtml(args.description) : '';
    }
    if (args.type !== undefined) dto.type = args.type;
    if (args.priority !== undefined) dto.priority = args.priority;
    if (args.labels !== undefined) dto.labels = args.labels;
    if (args.storyPoints !== undefined) dto.storyPoints = args.storyPoints;
    if (args.dueDate !== undefined) dto.dueDate = args.dueDate;
    if (args.status !== undefined) {
      dto.statusId = await this.access.resolveStatusId(projectId, args.status);
    }
    if (args.assignee !== undefined) {
      dto.assigneeId =
        args.assignee === null
          ? null
          : await this.access.resolveAssigneeId(ctx, projectId, args.assignee);
    }
    if (args.sprint !== undefined) {
      dto.sprintId =
        args.sprint === null ? null : await this.access.resolveSprintId(ctx, projectId, args.sprint);
    }
    if (args.parent !== undefined) {
      dto.parentId =
        args.parent === null ? null : await this.access.resolveParentId(ctx, projectId, args.parent);
    }
    return dto;
  }

  create(ctx: McpContext): McpServer {
    const server = new McpServer({ name: 'boardupscale', version: '1.0.0' });

    // Registering through a loosely typed handle avoids the SDK's deep zod
    // generics (they blow up tsc memory); args are typed via z.infer instead.
    const register = server.registerTool.bind(server) as (
      name: string,
      config: { description: string; inputSchema?: z.ZodRawShape },
      cb: (args: any) => Promise<ToolResult>,
    ) => void;

    const tool = <S extends z.ZodRawShape>(
      name: string,
      description: string,
      shape: S,
      fn: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
    ) =>
      register(name, { description, inputSchema: shape }, async (args) => {
        try {
          const value = await fn(args ?? {});
          this.logger.log(`tool=${name} user=${ctx.userId} token=${ctx.tokenId} ok`);
          return {
            content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
          };
        } catch (err) {
          if (err instanceof HttpException) {
            this.logger.log(
              `tool=${name} user=${ctx.userId} token=${ctx.tokenId} denied: ${err.message}`,
            );
            return {
              content: [{ type: 'text', text: `Error: ${err.message}` }],
              isError: true,
            };
          }
          this.logger.error(
            `tool=${name} user=${ctx.userId} failed: ${(err as Error)?.stack ?? err}`,
          );
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Internal error while running tool',
              },
            ],
            isError: true,
          };
        }
      });

    tool(
      'whoami',
      'Show the Boardupscale user and organization this token acts as.',
      {},
      async () => ({
        userId: ctx.userId,
        displayName: ctx.displayName,
        email: ctx.email,
        organizationId: ctx.organizationId,
        orgRole: ctx.orgRole,
        scopes: ctx.scopes,
      }),
    );

    tool(
      'list_projects',
      'List the projects you are a member of (or all projects if you are an org admin).',
      { search: z.string().max(100).optional() },
      async ({ search }) => {
        const { items } = await this.projectsService.findAll(
          ctx.organizationId,
          ctx.userId,
          ctx.orgRole,
          { search, limit: 100 },
        );
        return items.map((p: any) => ({
          key: p.key,
          name: p.name,
          type: p.type,
          description: htmlToText(p.description, 500),
          issueCount: p.issueCount,
        }));
      },
    );

    tool(
      'list_my_issues',
      'List issues assigned to you. Defaults to unfinished work (statusCategory todo + in_progress).',
      {
        project: projectKey.optional(),
        statusCategory: z
          .enum(STATUS_CATEGORIES)
          .optional()
          .describe('Omit to exclude done issues'),
        type: z.enum(ISSUE_TYPES).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      },
      async ({ project, statusCategory, type, limit }) => {
        const projectIds = project
          ? [await this.access.resolveProjectId(ctx, project)]
          : ((await this.access.visibleProjectIds(ctx)) ?? undefined);
        const categories = statusCategory ? [statusCategory] : ['todo', 'in_progress'];
        const results = await Promise.all(
          categories.map((category) =>
            this.issuesService.findAll({
              organizationId: ctx.organizationId,
              projectIds,
              assigneeId: ctx.userId,
              statusCategory: category,
              type,
              limit,
            }),
          ),
        );
        return {
          total: results.reduce((n, r) => n + r.total, 0),
          issues: results
            .flatMap((r) => r.items)
            .slice(0, limit)
            .map(summarizeIssue),
        };
      },
    );

    tool(
      'search_issues',
      'Search issues by text (title or key) and filters across projects you can access.',
      {
        query: z.string().max(200).optional().describe('Matches issue title or key'),
        project: projectKey.optional(),
        assignedToMe: z.boolean().optional(),
        type: z.enum(ISSUE_TYPES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        statusCategory: z.enum(STATUS_CATEGORIES).optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(25),
      },
      async (args) => {
        const projectIds = args.project
          ? [await this.access.resolveProjectId(ctx, args.project)]
          : ((await this.access.visibleProjectIds(ctx)) ?? undefined);
        const result = await this.issuesService.findAll({
          organizationId: ctx.organizationId,
          projectIds,
          search: args.query,
          assigneeId: args.assignedToMe ? ctx.userId : undefined,
          type: args.type,
          priority: args.priority,
          statusCategory: args.statusCategory,
          page: args.page,
          limit: args.limit,
        });
        return {
          total: result.total,
          page: result.page,
          issues: result.items.map(summarizeIssue),
        };
      },
    );

    tool(
      'get_issue',
      'Get full details of an issue: description, subtasks, links, comments, attachments, work logs and linked pull requests.',
      { key: issueKey },
      async ({ key }) => {
        const issue = await this.access.resolveIssue(ctx, key);
        const orgId = ctx.organizationId;
        const [children, links, comments, attachments, workLogs, prEvents] = await Promise.all([
          this.issuesService.getChildren(issue.id, orgId),
          this.issuesService.getLinks(issue.id, orgId, ctx.userId, ctx.orgRole),
          this.commentsService.findAll(issue.id, orgId),
          this.filesService.findByIssue(issue.id),
          this.issuesService.getWorkLogs(issue.id, orgId),
          this.githubService.getEventsForIssue(issue.id, orgId),
        ]);
        // getLinks returns { linkType, label, issue } with `issue` being the other side
        // (inward linkType is already inverted), already filtered to visible projects.
        const linkView = (l: any, dir: 'outward' | 'inward') => ({
          type: l.linkType,
          label: l.label,
          direction: dir,
          key: l.issue.key,
          title: l.issue.title,
          status: l.issue.status?.name ?? null,
        });
        return {
          ...summarizeIssue(issue),
          project: issue.project ? { key: issue.project.key, name: issue.project.name } : null,
          reporter: issue.reporter?.displayName ?? null,
          labels: issue.labels ?? [],
          description: htmlToText(issue.description),
          createdAt: issue.createdAt,
          subtasks: children.map(summarizeIssue),
          links: [
            ...links.outward.map((l) => linkView(l, 'outward')),
            ...links.inward.map((l) => linkView(l, 'inward')),
          ],
          comments: comments.slice(-30).map((c) => ({
            author: c.author?.displayName ?? null,
            createdAt: c.createdAt,
            body: htmlToText(c.content, 2000),
          })),
          attachments: attachments.map((a) => ({
            fileName: a.fileName,
            size: Number(a.fileSize),
            uploadedBy: a.uploader?.displayName ?? null,
            createdAt: a.createdAt,
          })),
          workLogs: workLogs.slice(0, 20).map((w) => ({
            user: w.user?.displayName ?? null,
            timeSpentMinutes: w.timeSpent,
            description: w.description,
            loggedAt: w.loggedAt,
          })),
          pullRequests: summarizePullRequests(prEvents),
        };
      },
    );

    tool('list_comments', 'List all comments on an issue.', { key: issueKey }, async ({ key }) => {
      const issue = await this.access.resolveIssue(ctx, key);
      const comments = await this.commentsService.findAll(issue.id, ctx.organizationId);
      return comments.map((c) => ({
        id: c.id,
        author: c.author?.displayName ?? null,
        createdAt: c.createdAt,
        body: htmlToText(c.content),
      }));
    });

    tool(
      'add_comment',
      'Post a comment on an issue as yourself. Plain text; blank lines separate paragraphs.',
      { key: issueKey, body: z.string().min(1).max(10000) },
      async ({ key, body }) => {
        const issue = await this.access.resolveIssue(ctx, key);
        await this.access.assertCanComment(ctx, issue.projectId);
        const comment = await this.commentsService.create(
          { issueId: issue.id, content: plainTextToHtml(body) },
          ctx.userId,
          ctx.organizationId,
        );
        await this.auditService.log(
          ctx.organizationId,
          ctx.userId,
          'mcp.comment.created',
          'comment',
          comment.id,
          {
            issueKey: issue.key,
            tokenId: ctx.tokenId,
          },
        );
        return { ok: true, issue: issue.key, commentId: comment.id };
      },
    );

    tool(
      'get_project_fields',
      'List the valid statuses, members (for assignee) and open sprints of a project — use before create_issue / update_issue.',
      { project: projectKey },
      async ({ project }) => {
        const projectId = await this.access.resolveProjectId(ctx, project);
        const [statuses, members, sprints] = await Promise.all([
          this.access.listStatuses(projectId),
          this.projectsService.getMembers(projectId, ctx.organizationId),
          this.sprintsService.findAll(projectId, ctx.organizationId),
        ]);
        return {
          statuses: statuses.map((s) => ({ name: s.name, category: s.category })),
          members: members.map((m) => ({
            displayName: m.user?.displayName ?? null,
            email: m.user?.email ?? null,
          })),
          sprints: sprints
            .filter((s) => s.status !== 'completed')
            .map((s) => ({ id: s.id, name: s.name, status: s.status })),
          issueTypes: ISSUE_TYPES,
          priorities: PRIORITIES,
        };
      },
    );

    tool(
      'create_issue',
      `Create an issue in a project. You become the reporter. ${WRITE_NOTE}`,
      {
        project: projectKey,
        title: z.string().min(1).max(500),
        ...issueFields,
        assignee: assignee.optional(),
        sprint: sprint.optional(),
        parent: parent.optional(),
        storyPoints: storyPoints.optional(),
        dueDate: dueDate.optional(),
      },
      async ({ project, ...args }) => {
        const projectId = await this.access.resolveProjectId(ctx, project);
        await this.access.assertCanWriteIssue(ctx, projectId, 'create');
        const fields = await this.toIssueFields(ctx, projectId, args);
        const issue = await this.issuesService.create(
          {
            ...fields,
            projectId,
            title: args.title,
            assigneeId: fields.assigneeId ?? undefined,
            sprintId: fields.sprintId ?? undefined,
            parentId: fields.parentId ?? undefined,
            dueDate: fields.dueDate ?? undefined,
            storyPoints: fields.storyPoints ?? undefined,
          },
          ctx.organizationId,
          ctx.userId,
        );
        await this.auditService.log(
          ctx.organizationId,
          ctx.userId,
          'mcp.issue.created',
          'issue',
          issue.id,
          { issueKey: issue.key, tokenId: ctx.tokenId },
        );
        return { ok: true, ...summarizeIssue(issue) };
      },
    );

    tool(
      'update_issue',
      `Edit an issue: title, description, type, priority, status, assignee, sprint, parent, story points, due date or labels. Only the fields you pass change; pass null to clear assignee, sprint, parent, storyPoints or dueDate. ${WRITE_NOTE}`,
      {
        key: issueKey,
        title: z.string().min(1).max(500).optional(),
        ...issueFields,
        assignee: assignee.nullable().optional(),
        sprint: sprint.nullable().optional(),
        parent: parent.nullable().optional(),
        storyPoints: storyPoints.nullable().optional(),
        dueDate: dueDate.nullable().optional(),
      },
      async ({ key, ...args }) => {
        const issue = await this.access.resolveIssue(ctx, key);
        await this.access.assertCanWriteIssue(ctx, issue.projectId, 'update');
        const fields = await this.toIssueFields(ctx, issue.projectId, args);
        const changed = Object.keys(fields);
        if (changed.length === 0) {
          throw new BadRequestException('Nothing to update — pass at least one field');
        }
        const updated = await this.issuesService.update(
          issue.id,
          ctx.organizationId,
          fields,
          ctx.userId,
        );
        await this.auditService.log(
          ctx.organizationId,
          ctx.userId,
          'mcp.issue.updated',
          'issue',
          issue.id,
          { issueKey: issue.key, fields: changed, tokenId: ctx.tokenId },
        );
        return { ok: true, ...summarizeIssue(updated) };
      },
    );

    tool(
      'list_sprints',
      'List sprints in a project (newest first).',
      {
        project: projectKey,
        status: z.enum(['planning', 'active', 'completed']).optional(),
      },
      async ({ project, status }) => {
        const projectId = await this.access.resolveProjectId(ctx, project);
        const sprints = await this.sprintsService.findAll(projectId, ctx.organizationId);
        return sprints
          .filter((s) => !status || s.status === status)
          .map((s) => ({
            id: s.id,
            name: s.name,
            status: s.status,
            goal: s.goal,
            startDate: s.startDate,
            endDate: s.endDate,
          }));
      },
    );

    tool(
      'get_board',
      'Get the board for a project: each status column with its issues.',
      {
        project: projectKey,
        columnLimit: z.number().int().min(1).max(50).default(20),
      },
      async ({ project, columnLimit }) => {
        const projectId = await this.access.resolveProjectId(ctx, project);
        const columns = await this.boardsService.getBoardData(projectId, ctx.organizationId, {
          columnLimit,
        } as BoardQueryDto);
        return columns.map((col: any) => ({
          status: col.name,
          category: col.category,
          total: col.total,
          wipLimit: col.wipLimit || null,
          issues: col.issues.map(summarizeIssue),
        }));
      },
    );

    tool(
      'list_pull_requests',
      'List GitHub pull requests linked to an issue, or to any issue in a project. Provide exactly one of issue or project.',
      {
        issue: issueKey.optional(),
        project: projectKey.optional(),
        state: z.enum(['open', 'merged', 'closed']).optional(),
      },
      async ({ issue, project, state }) => {
        if (!issue === !project) {
          throw new BadRequestException('Provide exactly one of "issue" or "project"');
        }
        const events = issue
          ? await this.githubService.getEventsForIssue(
              (await this.access.resolveIssue(ctx, issue)).id,
              ctx.organizationId,
            )
          : await this.githubService.getEventsForProject(
              await this.access.resolveProjectId(ctx, project),
              ctx.organizationId,
            );
        return summarizePullRequests(events).filter((pr) => !state || pr.state === state);
      },
    );

    return server;
  }
}
