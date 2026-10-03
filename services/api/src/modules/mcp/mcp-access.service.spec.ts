import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { McpAccessService } from './mcp-access.service';
import { McpContext } from './mcp.types';

const VISIBLE = '11111111-1111-4111-8111-111111111111';
const HIDDEN = '22222222-2222-4222-8222-222222222222';

describe('McpAccessService', () => {
  let projectsService: {
    findVisibleProjectIds: jest.Mock;
    resolveProjectId: jest.Mock;
    findById: jest.Mock;
    getMembers: jest.Mock;
  };
  let issuesService: { findByKey: jest.Mock };
  let permissionsService: { checkPermission: jest.Mock };
  let sprintsService: { findAll: jest.Mock };
  let statusRepo: { find: jest.Mock };
  let service: McpAccessService;
  let ctx: McpContext;

  beforeEach(() => {
    projectsService = {
      findVisibleProjectIds: jest.fn().mockResolvedValue([VISIBLE]),
      resolveProjectId: jest.fn(),
      findById: jest.fn(async (id: string) => ({ id })),
      getMembers: jest.fn().mockResolvedValue([
        { userId: 'user-2', user: { email: 'Bob@Example.com' } },
      ]),
    };
    issuesService = { findByKey: jest.fn() };
    permissionsService = { checkPermission: jest.fn().mockResolvedValue(true) };
    sprintsService = {
      findAll: jest.fn().mockResolvedValue([
        { id: 'sp-1', name: 'Sprint 1', status: 'completed' },
        { id: 'sp-2', name: 'Sprint 2', status: 'active' },
      ]),
    };
    statusRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 'st-1', name: 'To Do' },
        { id: 'st-2', name: 'In Progress' },
      ]),
    };
    service = new McpAccessService(
      projectsService as any,
      issuesService as any,
      permissionsService as any,
      sprintsService as any,
      statusRepo as any,
    );
    ctx = {
      userId: 'user-1',
      organizationId: 'org-1',
      orgRole: 'user',
      scopes: ['mcp:read', 'mcp:comment'],
      tokenId: 'tok',
      displayName: 'Ada',
      email: 'ada@example.com',
    };
  });

  it('computes visible projects once per request context', async () => {
    await service.visibleProjectIds(ctx);
    await service.visibleProjectIds(ctx);
    expect(projectsService.findVisibleProjectIds).toHaveBeenCalledTimes(1);
    expect(projectsService.findVisibleProjectIds).toHaveBeenCalledWith('org-1', 'user-1', 'user');
  });

  it('resolves a visible project key', async () => {
    projectsService.resolveProjectId.mockResolvedValue(VISIBLE);
    await expect(service.resolveProjectId(ctx, 'PROJ')).resolves.toBe(VISIBLE);
    expect(projectsService.resolveProjectId).toHaveBeenCalledWith('PROJ', 'org-1');
  });

  it('reports projects the user is not a member of as not found', async () => {
    projectsService.resolveProjectId.mockResolvedValue(HIDDEN);
    await expect(service.resolveProjectId(ctx, 'SECRET')).rejects.toThrow(NotFoundException);
    await expect(service.resolveProjectId(ctx, HIDDEN)).rejects.toThrow(NotFoundException);
  });

  it('looks up project UUIDs within the caller org only', async () => {
    projectsService.findById.mockRejectedValue(new NotFoundException());
    await expect(service.resolveProjectId(ctx, VISIBLE)).rejects.toThrow(NotFoundException);
    expect(projectsService.findById).toHaveBeenCalledWith(VISIBLE, 'org-1');
  });

  it('lets org owners/admins (null visibility) reach any project in their org', async () => {
    projectsService.findVisibleProjectIds.mockResolvedValue(null);
    projectsService.resolveProjectId.mockResolvedValue(HIDDEN);
    await expect(service.resolveProjectId(ctx, 'OTHER')).resolves.toBe(HIDDEN);
    issuesService.findByKey.mockResolvedValue({ id: 'i', projectId: HIDDEN });
    await expect(service.resolveIssue(ctx, 'OTHER-1')).resolves.toEqual({ id: 'i', projectId: HIDDEN });
  });

  it('reports issues in hidden projects exactly like missing issues', async () => {
    issuesService.findByKey.mockResolvedValue({ id: 'i', projectId: HIDDEN });
    const hidden = await service.resolveIssue(ctx, 'SECRET-1').catch((e) => e.message);
    issuesService.findByKey.mockResolvedValue(null);
    const missing = await service.resolveIssue(ctx, 'SECRET-1').catch((e) => e.message);
    expect(hidden).toBe(missing);
  });

  it('returns issues in visible projects', async () => {
    const issue = { id: 'i', projectId: VISIBLE };
    issuesService.findByKey.mockResolvedValue(issue);
    await expect(service.resolveIssue(ctx, 'PROJ-1')).resolves.toBe(issue);
    expect(issuesService.findByKey).toHaveBeenCalledWith('PROJ-1', 'org-1');
  });

  describe('assertCanComment', () => {
    it('checks comment:create in the project', async () => {
      await service.assertCanComment(ctx, VISIBLE);
      expect(permissionsService.checkPermission).toHaveBeenCalledWith(
        'user-1',
        VISIBLE,
        'comment',
        'create',
        'org-1',
      );
    });

    it('rejects when the project role lacks comment permission', async () => {
      permissionsService.checkPermission.mockResolvedValue(false);
      await expect(service.assertCanComment(ctx, VISIBLE)).rejects.toThrow(ForbiddenException);
    });

    it('rejects tokens without the mcp:comment scope', async () => {
      ctx.scopes = ['mcp:read'];
      await expect(service.assertCanComment(ctx, VISIBLE)).rejects.toThrow(ForbiddenException);
      expect(permissionsService.checkPermission).not.toHaveBeenCalled();
    });
  });

  describe('assertCanWriteIssue', () => {
    beforeEach(() => {
      ctx.scopes = ['mcp:read', 'mcp:comment', 'mcp:write'];
    });

    it.each(['create', 'update'] as const)('checks issue:%s in the project', async (action) => {
      await service.assertCanWriteIssue(ctx, VISIBLE, action);
      expect(permissionsService.checkPermission).toHaveBeenCalledWith(
        'user-1',
        VISIBLE,
        'issue',
        action,
        'org-1',
      );
    });

    it('rejects when the project role lacks the permission', async () => {
      permissionsService.checkPermission.mockResolvedValue(false);
      await expect(service.assertCanWriteIssue(ctx, VISIBLE, 'update')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects tokens without the mcp:write scope', async () => {
      ctx.scopes = ['mcp:read', 'mcp:comment'];
      await expect(service.assertCanWriteIssue(ctx, VISIBLE, 'create')).rejects.toThrow(
        ForbiddenException,
      );
      expect(permissionsService.checkPermission).not.toHaveBeenCalled();
    });
  });

  describe('field resolvers', () => {
    it('resolves statuses case-insensitively within the project', async () => {
      await expect(service.resolveStatusId(VISIBLE, 'in progress')).resolves.toBe('st-2');
      expect(statusRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: VISIBLE } }),
      );
    });

    it('lists valid statuses when the name is unknown', async () => {
      await expect(service.resolveStatusId(VISIBLE, 'Shipped')).rejects.toThrow(
        /Valid statuses: To Do, In Progress/,
      );
    });

    it('resolves sprints by name or id and rejects completed ones', async () => {
      await expect(service.resolveSprintId(ctx, VISIBLE, 'sprint 2')).resolves.toBe('sp-2');
      await expect(service.resolveSprintId(ctx, VISIBLE, 'sp-2')).resolves.toBe('sp-2');
      await expect(service.resolveSprintId(ctx, VISIBLE, 'Sprint 1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.resolveSprintId(ctx, VISIBLE, 'nope')).rejects.toThrow(NotFoundException);
      expect(sprintsService.findAll).toHaveBeenCalledWith(VISIBLE, 'org-1');
    });

    it("resolves assignees by project member email or 'me'", async () => {
      await expect(service.resolveAssigneeId(ctx, VISIBLE, 'me')).resolves.toBe('user-1');
      await expect(service.resolveAssigneeId(ctx, VISIBLE, 'bob@example.com')).resolves.toBe(
        'user-2',
      );
      await expect(service.resolveAssigneeId(ctx, VISIBLE, 'eve@example.com')).rejects.toThrow(
        BadRequestException,
      );
      expect(projectsService.getMembers).toHaveBeenCalledWith(VISIBLE, 'org-1');
    });

    it('requires parent issues to be visible and in the same project', async () => {
      issuesService.findByKey.mockResolvedValue({ id: 'p', projectId: VISIBLE });
      await expect(service.resolveParentId(ctx, VISIBLE, 'PROJ-9')).resolves.toBe('p');
      await expect(service.resolveParentId(ctx, 'other-project', 'PROJ-9')).rejects.toThrow(
        BadRequestException,
      );
      issuesService.findByKey.mockResolvedValue({ id: 'p', projectId: HIDDEN });
      await expect(service.resolveParentId(ctx, HIDDEN, 'SECRET-9')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
