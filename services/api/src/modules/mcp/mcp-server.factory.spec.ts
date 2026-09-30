import { NotFoundException } from '@nestjs/common';
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
    };
    issuesService = {
      findAll: jest.fn().mockResolvedValue({ items: [issue], total: 1, page: 1, limit: 25 }),
      getChildren: jest.fn().mockResolvedValue([]),
      getLinks: jest.fn().mockResolvedValue({ outward: [], inward: [] }),
      getWorkLogs: jest.fn().mockResolvedValue([]),
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
      { findAll: jest.fn().mockResolvedValue({ items: [] }) } as any,
      commentsService as any,
      { findAll: jest.fn().mockResolvedValue([]) } as any,
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

  it('exposes read tools and only one write tool (add_comment)', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_comment',
      'get_board',
      'get_issue',
      'list_comments',
      'list_my_issues',
      'list_projects',
      'list_pull_requests',
      'list_sprints',
      'search_issues',
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

  it('get_issue omits links to issues in projects the caller cannot see', async () => {
    issuesService.getLinks.mockResolvedValue({
      outward: [
        { id: 'l1', linkType: 'relates_to', label: 'relates to', issue: { key: 'SECRET-1', title: 'Hidden', projectId: 'proj-hidden' } },
      ],
      inward: [
        { id: 'l2', linkType: 'relates_to', label: 'relates to', issue: { key: 'PROJ-4', title: 'Visible', projectId: VISIBLE } },
      ],
    });
    const body = JSON.parse((await call('get_issue', { key: 'PROJ-1' })).text);
    expect(body.links.map((l: any) => l.key)).toEqual(['PROJ-4']);
    expect(JSON.stringify(body)).not.toContain('SECRET-1');

    access.visibleProjectIds.mockResolvedValue(null);
    const adminBody = JSON.parse((await call('get_issue', { key: 'PROJ-1' })).text);
    expect(adminBody.links.map((l: any) => l.key)).toEqual(['SECRET-1', 'PROJ-4']);
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

  it('list_pull_requests requires exactly one of issue or project', async () => {
    expect((await call('list_pull_requests', {})).isError).toBe(true);
    expect((await call('list_pull_requests', { issue: 'PROJ-1', project: 'PROJ' })).isError).toBe(true);
    const res = await call('list_pull_requests', { project: 'PROJ' });
    expect(res.isError).toBe(false);
    expect(githubService.getEventsForProject).toHaveBeenCalledWith(VISIBLE, 'org-1');
  });
});
