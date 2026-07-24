import {
  DashboardRange,
  ProjectHealthStatus,
} from '../project-health.constants';
import { MemberRoleBucket } from '../member-snapshot.constants';

export interface DashboardKpis {
  totalProjects: number;
  activeProjects: number;
  totalMembers: number;
  pendingInvites: number;
  billingStatus: string | null;
  billingPlanName: string | null;
  securityAlerts: { count: number; comingSoon: true };
}

export interface HealthSegment {
  key: ProjectHealthStatus;
  count: number;
  percent: number;
}

export interface DonutSection {
  total: number;
  segments: HealthSegment[];
}

export interface MemberRoleSegment {
  key: MemberRoleBucket;
  count: number;
  percent: number;
}

/**
 * Member Management Snapshot (replaces Organization Health donut).
 * Role bar uses distinct-user + highest-role precedence so multi-project
 * memberships do not inflate headcount.
 */
export interface MemberSnapshot {
  totalMembers: number;
  /** Trends A: organization_members.created_at within current UTC month. */
  membersAddedThisMonth: number;
  pendingInvites: number;
  /**
   * Trends A: pending invites created this month minus invites accepted
   * this month (negative ⇒ net decrease, e.g. −2).
   */
  pendingInvitesTrendDelta: number;
  /** Pending invites whose email verification token has not expired. */
  activeInvitations: number;
  /** Human hint from soonest unexpired invite expiry, or null. */
  activeInvitationsHint: string | null;
  roleDistribution: MemberRoleSegment[];
  countingRule: 'distinct_user_highest_role';
}

export interface ActivitySeriesPoint {
  date: string;
  count: number;
}

export interface ActivityFeedItem {
  id: string;
  userId: string | null;
  userDisplayName: string | null;
  userAvatarUrl: string | null;
  action: string;
  target: string;
  targetType: 'issue';
  issueKey: string | null;
  projectKey: string | null;
  createdAt: string;
}

export interface ProjectHealthRow {
  projectId: string;
  name: string;
  key: string;
  type: string;
  openIssues: number;
  blockedIssues: number;
  overdueIssues: number;
  doneIssues: number;
  activeSprintName: string | null;
  status: ProjectHealthStatus;
  progressPercent: number;
}

export interface OrgDashboardResponse {
  kpis: DashboardKpis;
  memberSnapshot: MemberSnapshot;
  projectsByStatus: DonutSection;
  activity: {
    series: ActivitySeriesPoint[];
    recent: ActivityFeedItem[];
  };
  meta: {
    range: DashboardRange;
    generatedAt: string;
    variant: 'org_owner';
    cacheHit: boolean;
  };
}

export interface OrgProjectHealthPage {
  items: ProjectHealthRow[];
  nextCursor: string | null;
  total: number;
}
