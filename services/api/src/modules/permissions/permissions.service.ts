import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';
import { User } from '../users/entities/user.entity';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private permissionRepo: Repository<Permission>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    @InjectRepository(ProjectMember)
    private projectMemberRepo: Repository<ProjectMember>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(OrganizationMember)
    private orgMemberRepo: Repository<OrganizationMember>,
  ) {}

  private async isOrgOwner(userId: string, organizationId: string): Promise<boolean> {
    if (!userId || !organizationId) return false;
    const membership = await this.orgMemberRepo.findOne({
      where: { userId, organizationId },
    });
    if (membership) {
      return membership.role === 'owner';
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.organizationId !== organizationId) return false;
    return user.role === 'owner';
  }

  /**
   * List all available permissions.
   */
  async findAllPermissions(): Promise<Permission[]> {
    return this.permissionRepo.find({ order: { resource: 'ASC', action: 'ASC' } });
  }

  /**
   * Get roles for an organization, including global system roles.
   * Pass scope='org'|'project' to filter; omit for all roles.
   */
  async getRolesForOrg(organizationId: string, scope?: string): Promise<Role[]> {
    const systemWhere: any = { organizationId: IsNull(), isSystem: true };
    if (scope) systemWhere.scope = scope;
    return this.roleRepo.find({
      where: [
        { organizationId, ...(scope ? { scope } : {}) },
        systemWhere,
      ],
      relations: ['permissions'],
      order: { isSystem: 'DESC', name: 'ASC' },
    });
  }

  /**
   * Get a single role by ID.
   */
  async getRoleById(roleId: string): Promise<Role> {
    const role = await this.roleRepo.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  /**
   * Create a custom role for an organization.
   */
  async createRole(
    organizationId: string,
    name: string,
    description: string | undefined,
    permissionIds: string[],
  ): Promise<Role> {
    const existing = await this.roleRepo.findOne({
      where: { organizationId, name },
    });
    if (existing) {
      throw new BadRequestException(`A role named "${name}" already exists in this organization`);
    }

    const permissions = await this.permissionRepo.find({
      where: { id: In(permissionIds) },
    });

    if (permissions.length !== permissionIds.length) {
      throw new BadRequestException('One or more permission IDs are invalid');
    }

    const role = this.roleRepo.create({
      organizationId,
      name,
      description,
      isSystem: false,
      permissions,
    });

    return this.roleRepo.save(role);
  }

  /**
   * Update a custom role. System roles cannot be modified.
   */
  async updateRole(
    roleId: string,
    data: { name?: string; description?: string; permissionIds?: string[] },
  ): Promise<Role> {
    const role = await this.getRoleById(roleId);

    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be modified');
    }

    if (data.name !== undefined) {
      role.name = data.name;
    }
    if (data.description !== undefined) {
      role.description = data.description;
    }
    if (data.permissionIds !== undefined) {
      const permissions = await this.permissionRepo.find({
        where: { id: In(data.permissionIds) },
      });
      if (permissions.length !== data.permissionIds.length) {
        throw new BadRequestException('One or more permission IDs are invalid');
      }
      role.permissions = permissions;
    }

    return this.roleRepo.save(role);
  }

  /**
   * Delete a custom role. System roles cannot be deleted.
   */
  async deleteRole(roleId: string): Promise<void> {
    const role = await this.getRoleById(roleId);

    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be deleted');
    }

    // Unset role_id on project members that reference this role
    await this.projectMemberRepo.update(
      { roleId },
      { roleId: null },
    );

    await this.roleRepo.remove(role);
  }

  /**
   * Assign a role to a project member.
   */
  async assignRoleToMember(
    projectId: string,
    projectMemberId: string,
    roleId: string,
    actorUserId?: string,
  ): Promise<ProjectMember> {
    const project = await this.resolveProject(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const actorIsOwner = actorUserId
      ? await this.isOrgOwner(actorUserId, project.organizationId)
      : false;
    // Project admins can also assign roles within their project — checked via project membership.
    let actorIsProjectAdmin = false;
    if (actorUserId && !actorIsOwner) {
      const actorMember = await this.projectMemberRepo.findOne({
        where: { projectId: project.id, userId: actorUserId },
      });
      actorIsProjectAdmin = actorMember?.role === 'admin';
    }
    if (!actorIsOwner && !actorIsProjectAdmin) {
      throw new ForbiddenException('Only the organization owner or a project admin can change roles');
    }

    const member = await this.projectMemberRepo.findOne({
      where: { id: projectMemberId },
      relations: ['user', 'assignedRole'],
    });
    if (!member) {
      throw new NotFoundException('Project member not found');
    }
    if (member.projectId !== project.id) {
      throw new ForbiddenException('Project member does not belong to this project');
    }
    if (actorUserId && member.userId === actorUserId) {
      throw new ForbiddenException('Cannot change your own role');
    }
    const targetIsOwner = await this.isOrgOwner(member.userId, project.organizationId);
    if (targetIsOwner) {
      const actorIsOwner = actorUserId
        ? await this.isOrgOwner(actorUserId, project.organizationId)
        : false;
      if (!actorIsOwner) {
        throw new ForbiddenException('Cannot change organization owner role');
      }
    }

    const role = await this.getRoleById(roleId);
    member.roleId = role.id;
    member.assignedRole = role;
    member.role = role.name.toLowerCase();

    return this.projectMemberRepo.save(member);
  }

  /**
   * Check an org-level permission when no project context exists (e.g. project
   * creation, column reordering on a project-scoped route that uses a slug
   * param the guard can't yet resolve).
   *
   * Uses the per-org role from organization_members first; falls back to
   * users.role for legacy rows. The first param used to be the legacy role
   * string — keeping old callers compatible via the `isLegacyRoleSignature`
   * branch below.
   */
  async checkOrgLevelPermission(
    userIdOrRole: string,
    organizationIdOrResource: string,
    resourceOrAction: string,
    action?: string,
  ): Promise<boolean> {
    // Legacy callers: checkOrgLevelPermission(role, resource, action)
    // New callers:    checkOrgLevelPermission(userId, orgId, resource, action)
    const isNewSignature = typeof action === 'string';
    const resource = isNewSignature ? resourceOrAction : organizationIdOrResource;
    const act = isNewSignature ? (action as string) : resourceOrAction;

    let effectiveRole: string | null = null;
    if (isNewSignature) {
      const userId = userIdOrRole;
      const organizationId = organizationIdOrResource;
      if (await this.isOrgOwner(userId, organizationId)) return true;
      // Determine the user's role in THIS org for non-owner checks.
      const membership = await this.orgMemberRepo.findOne({
        where: { userId, organizationId },
      });
      if (membership) {
        effectiveRole = membership.role;
      } else {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (user && user.organizationId === organizationId) effectiveRole = user.role;
      }
    } else {
      effectiveRole = userIdOrRole;
      if (effectiveRole === 'owner') return true;
    }

    if (!effectiveRole) return false;

    const systemRoleName = this.mapLegacyRole(effectiveRole);
    if (!systemRoleName) return false;

    const systemRole = await this.roleRepo.findOne({
      where: {
        name: systemRoleName,
        isSystem: true,
        organizationId: IsNull(),
      },
      relations: ['permissions'],
    });

    if (!systemRole) return false;

    return systemRole.permissions.some(
      (p) => p.resource === resource && p.action === act,
    );
  }

  /**
   * Given a @RequirePermission resource type and an arbitrary UUID hint
   * (which may be a resource UUID, not a project UUID), look up the parent
   * project from the resource's own table. Covers every project-scoped
   * resource used in the route layer.
   *
   * Returns null for org-level resources (webhooks, roles, etc.) and when
   * the record does not exist.
   */
  private async resolveProjectFromResource(
    resource: string,
    hint: string,
  ): Promise<{ id: string; organizationId: string } | null> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hint);
    if (!isUuid) return null;

    const mgr = this.projectMemberRepo.manager;
    try {
      switch (resource) {
        case 'issue':
        case 'worklog': {
          const row = await mgr
            .createQueryBuilder()
            .select('p.id', 'id')
            .addSelect('p.organization_id', 'organizationId')
            .from('issues', 'i')
            .innerJoin('projects', 'p', 'p.id = i.project_id')
            .where('i.id = :id AND i.deleted_at IS NULL', { id: hint })
            .getRawOne<{ id: string; organizationId: string }>();
          return row ?? null;
        }
        case 'sprint': {
          const row = await mgr
            .createQueryBuilder()
            .select('p.id', 'id')
            .addSelect('p.organization_id', 'organizationId')
            .from('sprints', 's')
            .innerJoin('projects', 'p', 'p.id = s.project_id')
            .where('s.id = :id', { id: hint })
            .getRawOne<{ id: string; organizationId: string }>();
          return row ?? null;
        }
        case 'comment': {
          // hint may be a comment UUID (edit/delete) or an issue UUID (create — no comment yet)
          const fromComment = await mgr
            .createQueryBuilder()
            .select('p.id', 'id')
            .addSelect('p.organization_id', 'organizationId')
            .from('comments', 'c')
            .innerJoin('issues', 'i', 'i.id = c.issue_id')
            .innerJoin('projects', 'p', 'p.id = i.project_id')
            .where('c.id = :id AND c.deleted_at IS NULL', { id: hint })
            .getRawOne<{ id: string; organizationId: string }>();
          if (fromComment) return fromComment;
          // fallback: hint is an issue UUID (POST /comments sends body.issueId)
          const fromIssue = await mgr
            .createQueryBuilder()
            .select('p.id', 'id')
            .addSelect('p.organization_id', 'organizationId')
            .from('issues', 'i')
            .innerJoin('projects', 'p', 'p.id = i.project_id')
            .where('i.id = :id AND i.deleted_at IS NULL', { id: hint })
            .getRawOne<{ id: string; organizationId: string }>();
          return fromIssue ?? null;
        }
        case 'page': {
          const row = await mgr
            .createQueryBuilder()
            .select('p.id', 'id')
            .addSelect('p.organization_id', 'organizationId')
            .from('pages', 'pg')
            .innerJoin('projects', 'p', 'p.id = pg.project_id')
            .where('pg.id = :id AND pg.deleted_at IS NULL', { id: hint })
            .getRawOne<{ id: string; organizationId: string }>();
          return row ?? null;
        }
        case 'automation': {
          const row = await mgr
            .createQueryBuilder()
            .select('p.id', 'id')
            .addSelect('p.organization_id', 'organizationId')
            .from('automation_rules', 'a')
            .innerJoin('projects', 'p', 'p.id = a.project_id')
            .where('a.id = :id', { id: hint })
            .getRawOne<{ id: string; organizationId: string }>();
          return row ?? null;
        }
        case 'version': {
          const row = await mgr
            .createQueryBuilder()
            .select('p.id', 'id')
            .addSelect('p.organization_id', 'organizationId')
            .from('versions', 'v')
            .innerJoin('projects', 'p', 'p.id = v.project_id')
            .where('v.id = :id', { id: hint })
            .getRawOne<{ id: string; organizationId: string }>();
          return row ?? null;
        }
        case 'component': {
          const row = await mgr
            .createQueryBuilder()
            .select('p.id', 'id')
            .addSelect('p.organization_id', 'organizationId')
            .from('components', 'c')
            .innerJoin('projects', 'p', 'p.id = c.project_id')
            .where('c.id = :id', { id: hint })
            .getRawOne<{ id: string; organizationId: string }>();
          return row ?? null;
        }
        case 'custom-field': {
          const row = await mgr
            .createQueryBuilder()
            .select('p.id', 'id')
            .addSelect('p.organization_id', 'organizationId')
            .from('custom_field_definitions', 'cf')
            .innerJoin('projects', 'p', 'p.id = cf.project_id')
            .where('cf.id = :id', { id: hint })
            .getRawOne<{ id: string; organizationId: string }>();
          return row ?? null;
        }
        case 'attachment': {
          // hint may be an attachment UUID (delete) or an issue UUID (upload routes)
          const fromAttachment = await mgr
            .createQueryBuilder()
            .select('p.id', 'id')
            .addSelect('p.organization_id', 'organizationId')
            .from('attachments', 'a')
            .innerJoin('issues', 'i', 'i.id = a.issue_id')
            .innerJoin('projects', 'p', 'p.id = i.project_id')
            .where('a.id = :id', { id: hint })
            .getRawOne<{ id: string; organizationId: string }>();
          if (fromAttachment) return fromAttachment;
          // upload/presign routes pass body.issueId as the hint
          const fromIssue = await mgr
            .createQueryBuilder()
            .select('p.id', 'id')
            .addSelect('p.organization_id', 'organizationId')
            .from('issues', 'i')
            .innerJoin('projects', 'p', 'p.id = i.project_id')
            .where('i.id = :id AND i.deleted_at IS NULL', { id: hint })
            .getRawOne<{ id: string; organizationId: string }>();
          return fromIssue ?? null;
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  /**
   * Resolves a project identifier (UUID or slug key) to its canonical UUID
   * and organization UUID in a single safe query. Never passes a non-UUID
   * value into a UUID column — builds the WHERE clause conditionally.
   *
   * Returns null when the project does not exist.
   */
  private async resolveProject(
    projectIdOrKey: string,
  ): Promise<{ id: string; organizationId: string } | null> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        projectIdOrKey,
      );
    try {
      const qb = this.projectMemberRepo.manager
        .getRepository('Project')
        .createQueryBuilder('p')
        .select('p.id', 'id')
        .addSelect('p.organization_id', 'organizationId');

      if (isUuid) {
        qb.where('p.id = :v', { v: projectIdOrKey });
      } else {
        qb.where('p.key = :v', { v: projectIdOrKey });
      }

      const row = await qb.getRawOne<{ id: string; organizationId: string }>();
      return row ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Core permission check: does the user have a specific resource+action
   * within a given project?
   *
   * Resolution order:
   * 1. Org Owner → always allowed (full bypass, no membership required).
   * 2. Org Admin → allowed WITHOUT membership only for exempted resources
   *    (member management, project settings, ai/Upsy). For all other project
   *    content (board, issues, sprints, pages, etc.) the admin must be an
   *    explicit project member — same as any other role.
   * 3. Look up the user's ProjectMember for the project.
   * 4. If the member has an assigned role (role_id), check its permissions.
   * 5. Fall back to matching a system role by the member's legacy 'role' string.
   *
   * Resources that Admin can access without project membership:
   *   'member'  — so admin can add themselves (or others) to the project
   *   'project' — so admin can view/update project settings
   *   'ai'      — org-level feature; Upsy is available org-wide
   */
  // No longer used — kept for reference only. Admin bypasses all resources now.
  // private readonly ADMIN_MEMBERSHIP_EXEMPT_RESOURCES = ['member', 'project', 'ai'];

  async checkPermission(
    userId: string,
    projectHint: string,
    resource: string,
    action: string,
    fallbackOrgId?: string,
  ): Promise<boolean> {
    // 1. Try hint as a project slug/UUID (covers project-prefixed routes).
    let project = await this.resolveProject(projectHint);

    // 2. If not a project, derive from the resource's own table
    //    (covers routes like PATCH /issues/:id where params.id is an issue UUID).
    if (!project) {
      project = await this.resolveProjectFromResource(resource, projectHint);
    }

    // 3. Still nothing — last resort: admin/owner bypass via fallback org.
    //    Org-level resources (webhooks, roles) land here too.
    if (!project) {
      if (fallbackOrgId) return this.isAdminOrOwner(userId, fallbackOrgId);
      return false;
    }

    // 2. Org Owner: unconditional full access regardless of project membership.
    if (await this.isOrgOwner(userId, project.organizationId)) return true;

    // Legacy global role fallback (pre-membership-row users).
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return false;
    if (user.role === 'owner') return true;

    // 3. Org Administrator: full project bypass per CSV O21
    //    (auto-grants Project Admin rights without requiring explicit membership).
    const orgMembership = await this.orgMemberRepo.findOne({
      where: { userId, organizationId: project.organizationId },
    });
    if (orgMembership?.role === 'administrator') return true;

    // 3. Find the project membership using the resolved UUID.
    const member = await this.projectMemberRepo.findOne({
      where: { projectId: project.id, userId },
      relations: ['assignedRole', 'assignedRole.permissions'],
    });
    if (!member) return false;

    // 5. If member has an explicit role_id, check those permissions.
    if (member.assignedRole?.permissions) {
      return member.assignedRole.permissions.some(
        (p) => p.resource === resource && p.action === action,
      );
    }

    // 6. Fallback: match legacy role string to system role name.
    const legacyRoleName = this.mapLegacyRole(member.role);
    if (!legacyRoleName) return false;

    const systemRole = await this.roleRepo.findOne({
      where: { name: legacyRoleName, isSystem: true, organizationId: IsNull() },
      relations: ['permissions'],
    });
    if (!systemRole) return false;

    return systemRole.permissions.some(
      (p) => p.resource === resource && p.action === action,
    );
  }

  /**
   * Get all permissions the current user has within a specific project.
   * Used by the frontend to conditionally render UI elements.
   */
  async getUserPermissionsForProject(
    userId: string,
    projectId: string,
  ): Promise<{ resource: string; action: string }[]> {
    const project = await this.resolveProject(projectId);
    if (!project) return [];

    // Owner: full access regardless of project membership.
    if (await this.isOrgOwner(userId, project.organizationId)) {
      const allPerms = await this.permissionRepo.find();
      return allPerms.map((p) => ({ resource: p.resource, action: p.action }));
    }

    // Legacy global role fallback (pre-membership-row users).
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return [];
    if (user.role === 'owner') {
      const allPerms = await this.permissionRepo.find();
      return allPerms.map((p) => ({ resource: p.resource, action: p.action }));
    }

    // Org Administrator: full project access bypass per CSV O21.
    const orgMembership = await this.orgMemberRepo.findOne({
      where: { userId, organizationId: project.organizationId },
    });
    if (orgMembership?.role === 'administrator') {
      const allPerms = await this.permissionRepo.find();
      return allPerms.map((p) => ({ resource: p.resource, action: p.action }));
    }

    const member = await this.projectMemberRepo.findOne({
      where: { projectId: project.id, userId },
      relations: ['assignedRole', 'assignedRole.permissions'],
    });
    if (!member) return [];

    if (member.assignedRole && member.assignedRole.permissions) {
      return member.assignedRole.permissions.map((p) => ({
        resource: p.resource,
        action: p.action,
      }));
    }

    // Fallback to legacy role
    const legacyRoleName = this.mapLegacyRole(member.role);
    if (!legacyRoleName) return [];

    const systemRole = await this.roleRepo.findOne({
      where: {
        name: legacyRoleName,
        isSystem: true,
        organizationId: IsNull(),
      },
      relations: ['permissions'],
    });

    if (!systemRole) return [];
    return systemRole.permissions.map((p) => ({
      resource: p.resource,
      action: p.action,
    }));
  }

  /**
   * Public helper consumed by service-layer ownership checks (comments,
   * worklogs, pages) to decide whether a caller can act on any resource
   * regardless of ownership (i.e. they are an org Owner or Administrator).
   */
  async isAdminOrOwner(userId: string, organizationId: string): Promise<boolean> {
    if (await this.isOrgOwner(userId, organizationId)) return true;
    const membership = await this.orgMemberRepo.findOne({
      where: { userId, organizationId },
    });
    return membership?.role === 'administrator';
  }

  /**
   * Map legacy role string values to system role names.
   * 'manager' is kept as an 'Admin' fallback to handle any data that was not
   * updated by the ManagerRoleToAdmin migration (e.g. custom-org roles that
   * happened to be named 'manager').
   */
  private mapLegacyRole(legacyRole: string): string | null {
    const mapping: Record<string, string> = {
      owner: 'Owner',
      administrator: 'Administrator',
      user: 'User',
      // project-level roles
      admin: 'Admin',
      member: 'Member',
      viewer: 'Viewer',
    };
    return mapping[legacyRole?.toLowerCase()] || null;
  }
}
