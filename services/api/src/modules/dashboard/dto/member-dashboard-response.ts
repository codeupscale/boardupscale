import { DashboardRange } from '../project-health.constants';
import { WorkloadCapacity } from '../team-workload.constants';
import { ActivityFeedItem } from './org-dashboard-response';

export type IssueStatusBucket = 'todo' | 'in_progress' | 'blocked' | 'done';

export interface MemberDashboardKpis {
  totalProjects: number;
  activeProjects: number;
  totalMembers: number;
  openIssues: number;
  overdueIssues: number;
}

export interface IssueStatusSegment {
  key: IssueStatusBucket;
  count: number;
  percent: number;
}

export interface IssueStatusDonut {
  total: number;
  segments: IssueStatusSegment[];
}

export interface ActiveSprintSummary {
  sprintId: string;
  name: string;
  projectId: string;
  projectName: string;
  startDate: string | null;
  endDate: string | null;
  totalIssues: number;
  doneIssues: number;
  progressPercent: number;
  daysLeft: number | null;
}

export interface WorkloadMember {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  activeCount: number;
  inProgressCount: number;
  doneCount: number;
  overdueCount: number;
  capacity: WorkloadCapacity;
}

export interface TeamWorkload {
  members: WorkloadMember[];
  topBusiest: WorkloadMember[];
  capacitySummary: {
    available: number;
    nearCapacity: number;
    overloaded: number;
  };
}

/** One entry in the member dashboard's project filter dropdown. */
export interface MemberScopedProject {
  id: string;
  name: string;
  key: string;
}

/** Keyset-paged "Recent Project Activity" — fetched independently via GET /dashboard/member/activity (infinite scroll, not part of the fixed-budget aggregate payload). */
export interface MemberActivityFeedPage {
  items: ActivityFeedItem[];
  nextCursor: string | null;
}

export interface MemberDashboardResponse {
  kpis: MemberDashboardKpis;
  issueStatus: IssueStatusDonut;
  activeSprints: ActiveSprintSummary[];
  teamWorkload: TeamWorkload;
  meta: {
    range: DashboardRange;
    generatedAt: string;
    variant: 'org_user';
    cacheHit: boolean;
  };
}
