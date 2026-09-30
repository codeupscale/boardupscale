import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, RequiredPermission } from '../decorators/require-permission.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PermissionsService } from '../../modules/permissions/permissions.service';

export const ROLES_KEY = 'roles';

export function Roles(...roles: string[]) {
  return (target: any, key?: string, descriptor?: any) => {
    if (descriptor) {
      Reflect.defineMetadata(ROLES_KEY, roles, descriptor.value);
      return descriptor;
    }
    Reflect.defineMetadata(ROLES_KEY, roles, target);
    return target;
  };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(PermissionsService) private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { user } = request;

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    // Check for granular permission-based access via @RequirePermission
    const requiredPermission = this.reflector.getAllAndOverride<RequiredPermission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredPermission) {
      // Collect every project-context hint the request carries. params.id may
      // be a resource UUID (issue, sprint, comment …) rather than a project
      // UUID; body.issueId covers attachment upload routes. checkPermissionForHints
      // resolves each one and requires ALL resolvable hints to pass, so a
      // ?projectId=<accessible project> cannot override the route's :id.
      const projectHints: string[] = [
        request.params?.projectId,
        request.query?.projectId,
        request.body?.projectId,
        request.params?.id,
        request.body?.issueId, // attachment upload / confirm-upload routes
        request.query?.issueId, // GET /files?issueId= and similar read routes
      ].filter((h): h is string => typeof h === 'string' && h.length > 0);
      // Bulk operation routes: EVERY issue's project must grant the permission,
      // not just the first one's.
      const bulkIssueIds: string[] = Array.isArray(request.body?.issueIds)
        ? request.body.issueIds.filter((h: unknown): h is string => typeof h === 'string' && h.length > 0)
        : [];

      if (projectHints.length === 0 && bulkIssueIds.length === 0) {
        // No resource context at all — purely org-level check.
        const allowed = await this.permissionsService.checkOrgLevelPermission(
          user.id,
          user.organizationId,
          requiredPermission.resource,
          requiredPermission.action,
        );
        if (!allowed) {
          throw new ForbiddenException('Insufficient permissions');
        }
        return true;
      }

      const hasPermission = await this.permissionsService.checkPermissionForHints(
        user.id,
        projectHints,
        requiredPermission.resource,
        requiredPermission.action,
        user.organizationId, // fallback for non-project resource routes
        bulkIssueIds,
      );

      if (!hasPermission) {
        throw new ForbiddenException('Insufficient permissions');
      }

      return true;
    }

    // Legacy role-based check via @Roles decorator
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const hasRole = requiredRoles.some((role) => user.role === role);
    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
