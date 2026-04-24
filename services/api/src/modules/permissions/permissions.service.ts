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

  /**
   * True if the user is an admin or owner **in the given organization**.
   * Reads from organization_members first (per-org role, authoritative in
   * the multi-org design) and falls back to users.role (legacy) only when
   * the user has no membership row — so pre-migration data still works.
   */
  private async isOrgAdminOrOwner(userId: string, organizationId: string): Promise<boolean> {
    if (!userId || !organizationId) return false;
    const membership = await this.orgMemberRepo.findOne({
      where: { userId, organizationId },
    });
    if (membership) {
      return membership.role === 'admin' || membership.role === 'owner';
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.organizationId !== organizationId) return false;
    return user.role === 'admin' || user.role === 'owner';
  }

  /**
   * List all available permissions.
   */
  async findAllPermissions(): Promise<Permission[]> {
    return this.permissionRepo.find({ order: { resource: 'ASC', action: 'ASC' } });
  }

  /**
   * Get roles for an organization, including global system roles.
   */
  async getRolesForOrg(organizationId: string): Promise<Role[]> {
    return this.roleRepo.find({
      where: [
        { organizationId },
        { organizationId: IsNull(), isSystem: true },
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
    projectMemberId: string,
    roleId: string,
  ): Promise<ProjectMember> {
    const member = await this.projectMemberRepo.findOne({
      where: { id: projectMemberId },
      relations: ['user', 'assignedRole'],
    });
    if (!member) {
      throw new NotFoundException('Project member not found');
    }

    const role = await this.getRoleById(roleId);
    member.roleId = role.id;
    member.assignedRole = role;

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
      if (await this.isOrgAdminOrOwner(userId, organizationId)) return true;
      // Determine the user's role in THIS org for non-admin checks.
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
      if (effectiveRole === 'admin' || effectiveRole === 'owner') return true;
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
   * 1. If user's org-level role is 'admin', always allow.
   * 2. Look up the user's ProjectMember for the project.
   * 3. If the member has an assigned role (role_id), check its permissions.
   * 4. Fall back to matching a system role by the member's legacy 'role' string.
   */
  async checkPermission(
    userId: string,
    projectId: string,
    resource: string,
    action: string,
  ): Promise<boolean> {
    // 1. Resolve slug/UUID → canonical project row (single query, type-safe).
    const project = await this.resolveProject(projectId);
    if (!project) return false;

    // 2. Org admin/owner shortcut.
    if (await this.isOrgAdminOrOwner(userId, project.organizationId)) return true;

    // Legacy global role fallback.
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'owner') return true;

    // 3. Find the project membership using the resolved UUID.
    const member = await this.projectMemberRepo.findOne({
      where: { projectId: project.id, userId },
      relations: ['assignedRole', 'assignedRole.permissions'],
    });
    if (!member) return false;

    // 4. If member has an explicit role_id, check those permissions.
    if (member.assignedRole?.permissions) {
      return member.assignedRole.permissions.some(
        (p) => p.resource === resource && p.action === action,
      );
    }

    // 5. Fallback: match legacy role string to system role name.
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
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return [];

    // Admins and org owners get all permissions
    if (user.role === 'admin' || user.role === 'owner') {
      const allPerms = await this.permissionRepo.find();
      return allPerms.map((p) => ({ resource: p.resource, action: p.action }));
    }

    const project = await this.resolveProject(projectId);
    if (!project) return [];

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
   * Map legacy role string values to system role names.
   */
  private mapLegacyRole(legacyRole: string): string | null {
    const mapping: Record<string, string> = {
      owner: 'Admin',
      admin: 'Admin',
      manager: 'Manager',
      member: 'Member',
      developer: 'Member',
      viewer: 'Viewer',
    };
    return mapping[legacyRole?.toLowerCase()] || null;
  }
}
