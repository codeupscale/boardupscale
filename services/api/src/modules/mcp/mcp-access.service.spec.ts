import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { McpAccessService } from './mcp-access.service';
import { McpContext } from './mcp.types';

const VISIBLE = '11111111-1111-4111-8111-111111111111';
const HIDDEN = '22222222-2222-4222-8222-222222222222';

describe('McpAccessService', () => {
  let projectsService: { findVisibleProjectIds: jest.Mock; resolveProjectId: jest.Mock };
  let issuesService: { findByKey: jest.Mock };
  let permissionsService: { checkPermission: jest.Mock };
  let service: McpAccessService;
  let ctx: McpContext;

  beforeEach(() => {
    projectsService = {
      findVisibleProjectIds: jest.fn().mockResolvedValue([VISIBLE]),
      resolveProjectId: jest.fn(),
    };
    issuesService = { findByKey: jest.fn() };
    permissionsService = { checkPermission: jest.fn().mockResolvedValue(true) };
    service = new McpAccessService(projectsService as any, issuesService as any, permissionsService as any);
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
});
