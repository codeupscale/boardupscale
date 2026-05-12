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
      // Build a project-context hint from all request sources.
      // Ordering matters: explicit projectId params win; params.id comes last
      // because it may be a resource UUID (issue, sprint, comment …) rather than
      // a project UUID. body.issueId is included for attachment upload routes
      // that carry no explicit project context.
      // checkPermission handles all three cases via resolveProjectFromResource.
      const projectHint: string | undefined =
        request.params?.projectId ||
        request.query?.projectId ||
        request.body?.projectId ||
        request.params?.id ||
        request.body?.issueId || // attachment upload / confirm-upload routes
        request.query?.issueId;  // GET /files?issueId= and similar read routes

      if (!projectHint) {
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

      const hasPermission = await this.permissionsService.checkPermission(
        user.id,
        projectHint,
        requiredPermission.resource,
        requiredPermission.action,
        user.organizationId, // fallback for non-project resource routes
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
