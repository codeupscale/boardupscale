import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import type { ActivityFeedItem, DashboardRange } from '@/hooks/useOrgDashboard'

export type IssueStatusBucket = 'todo' | 'in_progress' | 'blocked' | 'done'

export interface IssueStatusSegment {
  key: IssueStatusBucket
  count: number
  percent: number
}

export interface IssueStatusDonut {
  total: number
  segments: IssueStatusSegment[]
}

export interface MemberDashboardKpis {
  totalProjects: number
  activeProjects: number
  totalMembers: number
  openIssues: number
  overdueIssues: number
}

export interface ActiveSprintSummary {
  sprintId: string
  name: string
  projectId: string
  projectName: string
  startDate: string | null
  endDate: string | null
  totalIssues: number
  doneIssues: number
  progressPercent: number
  daysLeft: number | null
}

export type WorkloadCapacity = 'available' | 'near_capacity' | 'overloaded'

export interface WorkloadMember {
  userId: string
  displayName: string | null
  avatarUrl: string | null
  activeCount: number
  inProgressCount: number
  doneCount: number
  overdueCount: number
  capacity: WorkloadCapacity
}

export interface TeamWorkload {
  members: WorkloadMember[]
  topBusiest: WorkloadMember[]
  capacitySummary: {
    available: number
    nearCapacity: number
    overloaded: number
  }
}

export interface MemberDashboardData {
  kpis: MemberDashboardKpis
  issueStatus: IssueStatusDonut
  activeSprints: ActiveSprintSummary[]
  teamWorkload: TeamWorkload
  activity: {
    recent: ActivityFeedItem[]
  }
  meta: {
    range: DashboardRange
    generatedAt: string
    variant: 'org_user'
    cacheHit: boolean
  }
}

/** One entry in the member dashboard's project filter dropdown. */
export interface MemberScopedProject {
  id: string
  name: string
  key: string
}

/**
 * Independent, per-widget project filters. Each field narrows one specific
 * widget to a single project the caller owns or is a member of; omit (or
 * leave undefined) to show all of them for that widget. Widgets filter
 * independently of one another.
 */
export interface MemberDashboardProjectFilters {
  issueStatusProjectId?: string
  activeSprintProjectId?: string
  teamWorkloadProjectId?: string
  recentActivityProjectId?: string
}

export function useMemberDashboard(
  range: DashboardRange = '7d',
  filters: MemberDashboardProjectFilters = {},
) {
  const orgId = useAuthStore((s) => s.user?.organizationId)
  const {
    issueStatusProjectId,
    activeSprintProjectId,
    teamWorkloadProjectId,
    recentActivityProjectId,
  } = filters

  return useQuery({
    queryKey: [
      'dashboard',
      'member',
      orgId,
      range,
      issueStatusProjectId ?? 'all',
      activeSprintProjectId ?? 'all',
      teamWorkloadProjectId ?? 'all',
      recentActivityProjectId ?? 'all',
    ],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/member', {
        params: {
          range,
          issueStatusProjectId,
          activeSprintProjectId,
          teamWorkloadProjectId,
          recentActivityProjectId,
        },
        headers: { 'Cache-Control': 'no-store' },
      })
      return data.data as MemberDashboardData
    },
    enabled: !!orgId,
    placeholderData: (previousData) => previousData,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })
}

/** Projects the caller owns or is a member of — populates the dashboard's project filter dropdown. */
export function useMemberScopedProjects() {
  const orgId = useAuthStore((s) => s.user?.organizationId)

  return useQuery({
    queryKey: ['dashboard', 'member', 'projects', orgId],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/member/projects', {
        headers: { 'Cache-Control': 'no-store' },
      })
      return data.data as MemberScopedProject[]
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })
}
