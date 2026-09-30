import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { MCP_SCOPE_COMMENT } from '../api-keys/api-keys.service';
import { IssuesService } from '../issues/issues.service';
import { Issue } from '../issues/entities/issue.entity';
import { PermissionsService } from '../permissions/permissions.service';
import { ProjectsService } from '../projects/projects.service';
import { McpContext } from './mcp.types';

/**
 * Single choke point for MCP data access. Every tool resolves projects and
 * issues through here so a token can only reach what its user can see in the
 * browser. Inaccessible resources are reported exactly like missing ones.
 */
@Injectable()
export class McpAccessService {
  private visibleCache = new WeakMap<McpContext, Promise<string[]>>();

  constructor(
    private projectsService: ProjectsService,
    private issuesService: IssuesService,
    private permissionsService: PermissionsService,
  ) {}

  visibleProjectIds(ctx: McpContext): Promise<string[]> {
    let ids = this.visibleCache.get(ctx);
    if (!ids) {
      ids = this.projectsService.findVisibleProjectIds(ctx.organizationId, ctx.userId, ctx.orgRole);
      this.visibleCache.set(ctx, ids);
    }
    return ids;
  }

  async resolveProjectId(ctx: McpContext, keyOrId: string): Promise<string> {
    const projectId = isUUID(keyOrId)
      ? keyOrId
      : await this.projectsService.resolveProjectId(keyOrId, ctx.organizationId);
    if (!projectId || !(await this.visibleProjectIds(ctx)).includes(projectId)) {
      throw new NotFoundException(`Project "${keyOrId}" not found`);
    }
    return projectId;
  }

  async resolveIssue(ctx: McpContext, key: string): Promise<Issue> {
    const issue = await this.issuesService.findByKey(key, ctx.organizationId);
    if (!issue || !(await this.visibleProjectIds(ctx)).includes(issue.projectId)) {
      throw new NotFoundException(`Issue "${key}" not found`);
    }
    return issue;
  }

  async assertCanComment(ctx: McpContext, projectId: string): Promise<void> {
    if (!ctx.scopes.includes(MCP_SCOPE_COMMENT)) {
      throw new ForbiddenException('This token is not allowed to post comments');
    }
    const allowed = await this.permissionsService.checkPermission(
      ctx.userId,
      projectId,
      'comment',
      'create',
      ctx.organizationId,
    );
    if (!allowed) {
      throw new ForbiddenException('You do not have permission to comment in this project');
    }
  }
}
