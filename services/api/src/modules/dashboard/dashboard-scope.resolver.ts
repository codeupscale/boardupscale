import { Injectable } from '@nestjs/common';

export type DashboardVariant = 'org_owner' | 'org_admin' | 'org_user';

/**
 * Resolves project visibility for dashboard variants.
 * v1: org_owner → all projects in the organization (SQL filters by organization_id).
 * Admin/user variants will return explicit project ID lists later.
 */
@Injectable()
export class DashboardScopeResolver {
  resolveProjectScope(variant: DashboardVariant): 'all' | 'membership' {
    if (variant === 'org_owner' || variant === 'org_admin') {
      return 'all';
    }
    return 'membership';
  }
}
