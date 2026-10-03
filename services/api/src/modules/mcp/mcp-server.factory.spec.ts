import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServerFactory } from './mcp-server.factory';
import { McpContext } from './mcp.types';

const VISIBLE = 'proj-visible';

describe('McpServerFactory (via MCP protocol)', () => {
  let access: Record<string, jest.Mock>;
  let issuesService: Record<string, jest.Mock>;
  let commentsService: Record<string, jest.Mock>;
  let githubService: Record<string, jest.Mock>;
  let auditService: Record<string, jest.Mock>;
  let client: Client;

  const ctx: McpContext = {
    userId: 'user-1',
    organizationId: 'org-1',
    orgRole: 'user',
    scopes: ['mcp:read', 'mcp:comment'],
    tokenId: 'tok',
    displayName: 'Ada',
    email: 'ada@example.com',
  };

  const issue = {
    id: 'issue-1',
    key: 'PROJ-1',
    title: 'Login broken',
    type: 'bug',
    priority: 'high',
    projectId: VISIBLE,
    description: '<p>Steps</p>',
    status: { name: 'In Progress', category: 'in_progress' },
    project: { key: 'PROJ', name: 'Project' },
  };

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res: any = await client.callTool({ name, arguments: args });
    return { isError: !!res.isError, text: res.content[0].text as string };
  };

  beforeEach(async () => {
    access = {
      visibleProjectIds: jest.fn().mockResolvedValue([VISIBLE]),
      resolveProjectId: jest.fn().mockResolvedValue(VISIBLE),
      resolveIssue: jest.fn().mockResolvedValue(issue),
      assertCanComment: jest.fn().mockResolvedValue(undefined),
      assertCanWriteIssue: jest.fn().mockResolvedValue(undefined),
      listStatuses: jest.fn().mockResolvedValue([{ name: 'To Do', category: 'todo' }]),
      resolveStatusId: jest.fn().mockResolvedValue('status-done'),
      resolveAssigneeId: jest.fn().mockResolvedValue('user-2'),
      resolveSprintId: jest.fn().mockResolvedValue('sprint-1'),
      resolveParentId: jest.fn().mockResolvedValue('parent-1'),
    };
    issuesService = {
      findAll: jest.fn().mockResolvedValue({ items: [issue], total: 1, page: 1, limit: 25 }),
      getChildren: jest.fn().mockResolvedValue([]),
      getLinks: jest.fn().mockResolvedValue({ outward: [], inward: [] }),
      getWorkLogs: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ ...issue, id: 'issue-2', key: 'PROJ-2' }),
      update: jest.fn().mockResolvedValue(issue),
    };
    commentsService = {
      findAll: jest.fn().mockResolvedValue([{ id: 'c1', content: '<p>hi</p>', author: { displayName: 'Bob' } }]),
      create: jest.fn().mockResolvedValue({ id: 'c2' }),
    };
    githubService = {
      getEventsForIssue: jest.fn().mockResolvedValue([
        { eventType: 'pr_opened', prNumber: 3, prTitle: 'Fix login', prUrl: 'https://gh/pr/3', branchName: 'PROJ-1', author: 'ada', createdAt: new Date() },
      ]),
      getEventsForProject: jest.fn().mockResolvedValue([]),
    };
    auditService = { log: jest.fn().mockResolvedValue({}) };

    const factory = new McpServerFactory(
      access as any,
      issuesService as any,
      {
        findAll: jest.fn().mockResolvedValue({ items: [] }),
        getMembers: jest
          .fn()
          .mockResolvedValue([{ user: { displayName: 'Bob', email: 'bob@example.com' } }]),
      } as any,
      commentsService as any,
      {
        findAll: jest.fn().mockResolvedValue([
          { id: 's1', name: 'Old', status: 'completed' },
          { id: 's2', name: 'Now', status: 'active' },
        ]),
      } as any,
      { getBoardData: jest.fn().mockResolvedValue([]) } as any,
      { findByIssue: jest.fn().mockResolvedValue([]) } as any,
      githubService as any,
      auditService as any,
    );
    const server = factory.create(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(() => client.close());

  it('exposes read tools plus comment and issue write tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_comment',
      'create_issue',
      'get_board',
      'get_issue',
      'get_project_fields',
      'list_comments',
      'list_my_issues',
      'list_projects',
      'list_pull_requests',
      'list_sprints',
      'search_issues',
      'update_issue',
      'whoami',
    ]);
  });

  it('list_my_issues is always scoped to the caller and their visible projects', async () => {
    await call('list_my_issues');
    expect(issuesService.findAll).toHaveBeenCalledTimes(2);
    for (const [filters] of issuesService.findAll.mock.calls) {
      expect(filters).toEqual(
        expect.objectContaining({ organizationId: 'org-1', assigneeId: 'user-1', projectIds: [VISIBLE] }),
      );
    }
    expect(issuesService.findAll.mock.calls.map(([f]) => f.statusCategory)).toEqual(['todo', 'in_progress']);
  });

  it('search_issues never queries outside visible projects', async () => {
    await call('search_issues', { query: 'login' });
    expect(issuesService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', projectIds: [VISIBLE], search: 'login' }),
    );
  });

  it('org admins (null visibility) search the whole org without a project filter', async () => {
    access.visibleProjectIds.mockResolvedValue(null);
    await call('search_issues', { query: 'login' });
    expect(issuesService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', projectIds: undefined }),
    );
  });

  it('get_issue returns details with plain-text description and linked PRs', async () => {
    const { isError, text } = await call('get_issue', { key: 'PROJ-1' });
    expect(isError).toBe(false);
    const body = JSON.parse(text);
    expect(body).toEqual(
      expect.objectContaining({ key: 'PROJ-1', description: 'Steps', status: 'In Progress' }),
    );
    expect(body.pullRequests).toEqual([expect.objectContaining({ number: 3, state: 'open' })]);
  });

  it('get_issue exposes the other side of outward and inward links', async () => {
    issuesService.getLinks.mockResolvedValue({
      outward: [
        {
          id: 'l1',
          linkType: 'blocks',
          label: 'blocks',
          issue: { key: 'PROJ-2', title: 'Session store', projectId: VISIBLE, status: { name: 'To Do' } },
        },
      ],
      inward: [
        {
          id: 'l2',
          linkType: 'is_blocked_by',
          label: 'is blocked by',
          issue: { key: 'PROJ-3', title: 'Auth refactor', projectId: VISIBLE, status: { name: 'Done' } },
        },
      ],
    });
    const body = JSON.parse((await call('get_issue', { key: 'PROJ-1' })).text);
    expect(body.links).toEqual([
      { type: 'blocks', label: 'blocks', direction: 'outward', key: 'PROJ-2', title: 'Session store', status: 'To Do' },
      {
        type: 'is_blocked_by',
        label: 'is blocked by',
        direction: 'inward',
        key: 'PROJ-3',
        title: 'Auth refactor',
        status: 'Done',
      },
    ]);
  });

  it('get_issue filters links by the caller\'s project visibility', async () => {
    await call('get_issue', { key: 'PROJ-1' });
    expect(issuesService.getLinks).toHaveBeenCalledWith('issue-1', 'org-1', 'user-1', 'user');
  });

  it('returns a tool error (not a crash) for inaccessible issues', async () => {
    access.resolveIssue.mockRejectedValue(new NotFoundException('Issue "SECRET-1" not found'));
    const res = await call('get_issue', { key: 'SECRET-1' });
    expect(res).toEqual({ isError: true, text: 'Error: Issue "SECRET-1" not found' });
    expect(issuesService.getChildren).not.toHaveBeenCalled();
  });

  it('hides internal error details', async () => {
    issuesService.getChildren.mockRejectedValue(new Error('connection refused at 10.0.0.5'));
    const res = await call('get_issue', { key: 'PROJ-1' });
    expect(res).toEqual({ isError: true, text: 'Error: Internal error while running tool' });
  });

  it('add_comment checks permission, escapes content, and audits', async () => {
    const res = await call('add_comment', { key: 'PROJ-1', body: '<script>x</script>' });
    expect(res.isError).toBe(false);
    expect(access.assertCanComment).toHaveBeenCalledWith(ctx, VISIBLE);
    expect(commentsService.create).toHaveBeenCalledWith(
      { issueId: 'issue-1', content: '<p>&lt;script&gt;x&lt;/script&gt;</p>' },
      'user-1',
      'org-1',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'mcp.comment.created',
      'comment',
      'c2',
      expect.objectContaining({ issueKey: 'PROJ-1', tokenId: 'tok' }),
    );
  });

  it('add_comment does not write when permission is denied', async () => {
    access.assertCanComment.mockRejectedValue(new NotFoundException('nope'));
    const res = await call('add_comment', { key: 'PROJ-1', body: 'hi' });
    expect(res.isError).toBe(true);
    expect(commentsService.create).not.toHaveBeenCalled();
  });

  it('get_project_fields lists statuses, members and open sprints only', async () => {
    const body = JSON.parse((await call('get_project_fields', { project: 'PROJ' })).text);
    expect(access.resolveProjectId).toHaveBeenCalledWith(ctx, 'PROJ');
    expect(body.statuses).toEqual([{ name: 'To Do', category: 'todo' }]);
    expect(body.members).toEqual([{ displayName: 'Bob', email: 'bob@example.com' }]);
    expect(body.sprints).toEqual([{ id: 's2', name: 'Now', status: 'active' }]);
  });

  it('create_issue checks permission, resolves names, escapes description, and audits', async () => {
    const res = await call('create_issue', {
      project: 'PROJ',
      title: 'New bug',
      description: '<b>boom</b>',
      type: 'bug',
      status: 'Done',
      assignee: 'bob@example.com',
      sprint: 'Now',
      parent: 'PROJ-1',
      dueDate: '2026-12-01',
    });
    expect(res.isError).toBe(false);
    expect(JSON.parse(res.text)).toEqual(expect.objectContaining({ ok: true, key: 'PROJ-2' }));
    expect(access.assertCanWriteIssue).toHaveBeenCalledWith(ctx, VISIBLE, 'create');
    expect(access.resolveAssigneeId).toHaveBeenCalledWith(ctx, VISIBLE, 'bob@example.com');
    expect(issuesService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: VISIBLE,
        title: 'New bug',
        description: '<p>&lt;b&gt;boom&lt;/b&gt;</p>',
        type: 'bug',
        statusId: 'status-done',
        assigneeId: 'user-2',
        sprintId: 'sprint-1',
        parentId: 'parent-1',
        dueDate: '2026-12-01',
      }),
      'org-1',
      'user-1',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'mcp.issue.created',
      'issue',
      'issue-2',
      expect.objectContaining({ issueKey: 'PROJ-2', tokenId: 'tok' }),
    );
  });

  it('create_issue does not write when permission is denied', async () => {
    access.assertCanWriteIssue.mockRejectedValue(new ForbiddenException('no write'));
    const res = await call('create_issue', { project: 'PROJ', title: 'x', status: 'Done' });
    expect(res).toEqual({ isError: true, text: 'Error: no write' });
    expect(access.resolveStatusId).not.toHaveBeenCalled();
    expect(issuesService.create).not.toHaveBeenCalled();
  });

  it('create_issue cannot target an inaccessible project', async () => {
    access.resolveProjectId.mockRejectedValue(new NotFoundException('Project "SECRET" not found'));
    const res = await call('create_issue', { project: 'SECRET', title: 'x' });
    expect(res.isError).toBe(true);
    expect(issuesService.create).not.toHaveBeenCalled();
  });

  it('update_issue only sends passed fields, clears with null, and audits', async () => {
    const res = await call('update_issue', {
      key: 'PROJ-1',
      priority: 'low',
      status: 'Done',
      assignee: null,
      sprint: null,
    });
    expect(res.isError).toBe(false);
    expect(access.assertCanWriteIssue).toHaveBeenCalledWith(ctx, VISIBLE, 'update');
    expect(issuesService.update).toHaveBeenCalledWith(
      'issue-1',
      'org-1',
      { priority: 'low', statusId: 'status-done', assigneeId: null, sprintId: null },
      'user-1',
    );
    expect(access.resolveAssigneeId).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'mcp.issue.updated',
      'issue',
      'issue-1',
      expect.objectContaining({
        issueKey: 'PROJ-1',
        fields: ['priority', 'statusId', 'assigneeId', 'sprintId'],
      }),
    );
  });

  it('update_issue rejects an empty update', async () => {
    const res = await call('update_issue', { key: 'PROJ-1' });
    expect(res.isError).toBe(true);
    expect(issuesService.update).not.toHaveBeenCalled();
  });

  it('update_issue does not write when permission is denied or issue is hidden', async () => {
    access.assertCanWriteIssue.mockRejectedValue(new ForbiddenException('no write'));
    expect((await call('update_issue', { key: 'PROJ-1', title: 'x' })).isError).toBe(true);
    access.resolveIssue.mockRejectedValue(new NotFoundException('Issue "SECRET-1" not found'));
    expect((await call('update_issue', { key: 'SECRET-1', title: 'x' })).isError).toBe(true);
    expect(issuesService.update).not.toHaveBeenCalled();
  });

  it('list_pull_requests requires exactly one of issue or project', async () => {
    expect((await call('list_pull_requests', {})).isError).toBe(true);
    expect((await call('list_pull_requests', { issue: 'PROJ-1', project: 'PROJ' })).isError).toBe(true);
    const res = await call('list_pull_requests', { project: 'PROJ' });
    expect(res.isError).toBe(false);
    expect(githubService.getEventsForProject).toHaveBeenCalledWith(VISIBLE, 'org-1');
  });
});
