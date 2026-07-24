import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'

export type DashboardRange = '7d' | '30d'

export type ProjectHealthStatus =
  | 'active'
  | 'at_risk'
  | 'blocked'
  | 'completed'

export interface OrgDashboardKpis {
  totalProjects: number
  activeProjects: number
  totalMembers: number
  pendingInvites: number
  billingStatus: string | null
  billingPlanName: string | null
  securityAlerts: { count: number; comingSoon: true }
}

export interface HealthSegment {
  key: ProjectHealthStatus
  count: number
  percent: number
}

export interface DonutSection {
  total: number
  segments: HealthSegment[]
}

export type MemberRoleBucket =
  | 'org_owner'
  | 'org_administrator'
  | 'project_admin'
  | 'project_member'
  | 'project_viewer'
  | 'org_user'

export interface MemberRoleSegment {
  key: MemberRoleBucket
  count: number
  percent: number
}

export interface MemberSnapshot {
  totalMembers: number
  membersAddedThisMonth: number
  pendingInvites: number
  pendingInvitesTrendDelta: number
  activeInvitations: number
  activeInvitationsHint: string | null
  roleDistribution: MemberRoleSegment[]
  countingRule: 'distinct_user_highest_role'
}

export interface ActivitySeriesPoint {
  date: string
  count: number
}

export interface ActivityFeedItem {
  id: string
  userId: string | null
  userDisplayName: string | null
  userAvatarUrl: string | null
  action: string
  target: string
  targetType: 'issue'
  issueKey: string | null
  projectKey: string | null
  createdAt: string
}

export interface ProjectHealthRow {
  projectId: string
  name: string
  key: string
  type: string
  openIssues: number
  blockedIssues: number
  overdueIssues: number
  doneIssues: number
  activeSprintName: string | null
  status: ProjectHealthStatus
  progressPercent: number
}

export interface OrgDashboardData {
  kpis: OrgDashboardKpis
  memberSnapshot: MemberSnapshot
  projectsByStatus: DonutSection
  activity: {
    series: ActivitySeriesPoint[]
    recent: ActivityFeedItem[]
  }
  meta: {
    range: DashboardRange
    generatedAt: string
    variant: 'org_owner'
    cacheHit: boolean
  }
}

export function useOrgDashboard(range: DashboardRange = '7d') {
  const orgId = useAuthStore((s) => s.user?.organizationId)

  return useQuery({
    queryKey: ['dashboard', 'organization', orgId, range],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/organization', {
        params: { range },
        headers: { 'Cache-Control': 'no-store' },
      })
      return data.data as OrgDashboardData
    },
    enabled: !!orgId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })
}
