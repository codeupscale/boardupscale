/**
 * Member Management Snapshot — role distribution buckets.
 *
 * Counting rule (enterprise / Jira-style headcount chart):
 * each org member is counted **once**, even if they hold project roles on
 * multiple projects. Highest-authority precedence wins:
 *   Org Owner → Org Administrator → Project Admin → Project Member →
 *   Project Viewer → Org User
 */
export const MEMBER_ROLE_BUCKETS = [
  'org_owner',
  'org_administrator',
  'project_admin',
  'project_member',
  'project_viewer',
  'org_user',
] as const;

export type MemberRoleBucket = (typeof MEMBER_ROLE_BUCKETS)[number];

export const MEMBER_ROLE_BUCKET_LABELS: Record<MemberRoleBucket, string> = {
  org_owner: 'Org Owners',
  org_administrator: 'Org Admins',
  project_admin: 'Project Admins',
  project_member: 'Project Members',
  project_viewer: 'Project Viewers',
  org_user: 'Org Users',
};
