import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { Repository } from 'typeorm';
import { MCP_SCOPE_COMMENT, MCP_SCOPE_WRITE } from '../api-keys/api-keys.service';
import { IssuesService } from '../issues/issues.service';
import { Issue } from '../issues/entities/issue.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { PermissionsService } from '../permissions/permissions.service';
import { ProjectsService } from '../projects/projects.service';
import { SprintsService } from '../sprints/sprints.service';
import { McpContext } from './mcp.types';

/**
 * Single choke point for MCP data access. Every tool resolves projects and
 * issues through here so a token can only reach what its user can see in the
 * browser. Inaccessible resources are reported exactly like missing ones.
 */
@Injectable()
export class McpAccessService {
  private visibleCache = new WeakMap<McpContext, Promise<string[] | null>>();

  constructor(
    private projectsService: ProjectsService,
    private issuesService: IssuesService,
    private permissionsService: PermissionsService,
    private sprintsService: SprintsService,
    @InjectRepository(IssueStatus)
    private statusRepo: Repository<IssueStatus>,
  ) {}

  /**
   * Project IDs the caller may read, or `null` for org owners/admins, who
   * have org-wide access (queries must still be scoped by organizationId).
   */
  visibleProjectIds(ctx: McpContext): Promise<string[] | null> {
    let ids = this.visibleCache.get(ctx);
    if (!ids) {
      ids = this.projectsService.findVisibleProjectIds(ctx.organizationId, ctx.userId, ctx.orgRole);
      this.visibleCache.set(ctx, ids);
    }
    return ids;
  }

  private async canSee(ctx: McpContext, projectId: string): Promise<boolean> {
    const visible = await this.visibleProjectIds(ctx);
    return visible === null || visible.includes(projectId);
  }

  async resolveProjectId(ctx: McpContext, keyOrId: string): Promise<string> {
    const projectId = isUUID(keyOrId)
      ? await this.projectsService
          .findById(keyOrId, ctx.organizationId)
          .then((p) => p.id)
          .catch(() => null)
      : await this.projectsService.resolveProjectId(keyOrId, ctx.organizationId);
    if (!projectId || !(await this.canSee(ctx, projectId))) {
      throw new NotFoundException(`Project "${keyOrId}" not found`);
    }
    return projectId;
  }

  async resolveIssue(ctx: McpContext, key: string): Promise<Issue> {
    const issue = await this.issuesService.findByKey(key, ctx.organizationId);
    if (!issue || !(await this.canSee(ctx, issue.projectId))) {
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

  /** Requires the token's write scope and the user's project-level issue permission. */
  async assertCanWriteIssue(
    ctx: McpContext,
    projectId: string,
    action: 'create' | 'update',
  ): Promise<void> {
    if (!ctx.scopes.includes(MCP_SCOPE_WRITE)) {
      throw new ForbiddenException(
        'This token is not allowed to create or edit issues. Create a token with write access in Settings > AI / MCP.',
      );
    }
    const allowed = await this.permissionsService.checkPermission(
      ctx.userId,
      projectId,
      'issue',
      action,
      ctx.organizationId,
    );
    if (!allowed) {
      throw new ForbiddenException(`You do not have permission to ${action} issues in this project`);
    }
  }

  /** Statuses (board columns) of a project, in board order. */
  listStatuses(projectId: string): Promise<IssueStatus[]> {
    return this.statusRepo.find({ where: { projectId }, order: { position: 'ASC' } });
  }

  async resolveStatusId(projectId: string, name: string): Promise<string> {
    const statuses = await this.listStatuses(projectId);
    const wanted = name.trim().toLowerCase();
    const match = statuses.find((s) => s.name.toLowerCase() === wanted);
    if (!match) {
      throw new BadRequestException(
        `Unknown status "${name}". Valid statuses: ${statuses.map((s) => s.name).join(', ')}`,
      );
    }
    return match.id;
  }

  /** Sprint by id or (case-insensitive) name within the project; completed sprints are rejected. */
  async resolveSprintId(ctx: McpContext, projectId: string, nameOrId: string): Promise<string> {
    const sprints = await this.sprintsService.findAll(projectId, ctx.organizationId);
    const wanted = nameOrId.trim().toLowerCase();
    const match = sprints.find((s) => s.id === nameOrId || s.name.toLowerCase() === wanted);
    if (!match) {
      throw new NotFoundException(`Sprint "${nameOrId}" not found in this project`);
    }
    if (match.status === 'completed') {
      throw new BadRequestException(`Sprint "${match.name}" is completed`);
    }
    return match.id;
  }

  /** Project member by email, or `me` for the caller. */
  async resolveAssigneeId(ctx: McpContext, projectId: string, emailOrMe: string): Promise<string> {
    if (emailOrMe.trim().toLowerCase() === 'me') return ctx.userId;
    const members = await this.projectsService.getMembers(projectId, ctx.organizationId);
    const wanted = emailOrMe.trim().toLowerCase();
    const match = members.find((m) => m.user?.email?.toLowerCase() === wanted);
    if (!match) {
      throw new BadRequestException(`"${emailOrMe}" is not a member of this project`);
    }
    return match.userId;
  }

  /** Parent issue by key; must be visible and in the same project. */
  async resolveParentId(ctx: McpContext, projectId: string, key: string): Promise<string> {
    const parent = await this.resolveIssue(ctx, key);
    if (parent.projectId !== projectId) {
      throw new BadRequestException('Parent issue must be in the same project');
    }
    return parent.id;
  }
}
