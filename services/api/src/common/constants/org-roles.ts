/** Org roles that bypass project membership for org-wide resource visibility (O21). */
export const ORG_WIDE_ACCESS_ROLES = ['owner', 'administrator'] as const;

export type OrgWideAccessRole = (typeof ORG_WIDE_ACCESS_ROLES)[number];

export function hasOrgWideAccess(orgRole?: string | null): boolean {
  return orgRole === 'owner' || orgRole === 'administrator';
}
