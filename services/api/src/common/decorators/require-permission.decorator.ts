import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';

export interface RequiredPermission {
  resource: string;
  action: string;
}

/**
 * Decorator that specifies the resource and action permission required
 * to access an endpoint. Used together with the PermissionGuard.
 *
 * @example
 * @RequirePermission('issue', 'create')
 * @Post()
 * async createIssue() { ... }
 */
export const RequirePermission = (resource: string, action: string) =>
  SetMetadata(PERMISSION_KEY, { resource, action } as RequiredPermission);
