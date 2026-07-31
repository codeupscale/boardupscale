import { useInfiniteQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import type { ProjectHealthStatus } from '@/hooks/useOrgDashboard'
import {
  buildProjectHealthRequestParams,
  getProjectHealthNextPageParam,
  type OrgProjectHealthPage,
} from '@/hooks/project-health-query'

export {
  PROJECT_HEALTH_PAGE_SIZE,
  PROJECT_HEALTH_VIEWPORT_ROWS,
  PROJECT_HEALTH_ROW_HEIGHT_PX,
  PROJECT_HEALTH_HEADER_HEIGHT_PX,
  PROJECT_HEALTH_PREFETCH_ROWS,
  buildProjectHealthRequestParams,
  getProjectHealthNextPageParam,
  flattenProjectHealthPages,
  resolveProjectHealthViewState,
  shouldFetchNextProjectHealthPage,
  type OrgProjectHealthPage,
  type ProjectHealthViewState,
} from '@/hooks/project-health-query'

export type ProjectHealthScope = 'organization' | 'member'

const PROJECT_HEALTH_ENDPOINT: Record<ProjectHealthScope, string> = {
  organization: '/dashboard/organization/project-health',
  member: '/dashboard/member/project-health',
}

export function useOrgProjectHealth(
  status: ProjectHealthStatus | 'all' = 'all',
  scope: ProjectHealthScope = 'organization',
) {
  const orgId = useAuthStore((s) => s.user?.organizationId)

  return useInfiniteQuery({
    queryKey: ['dashboard', scope, 'project-health', orgId, status],
    queryFn: async ({ pageParam }): Promise<OrgProjectHealthPage> => {
      const { data } = await api.get(PROJECT_HEALTH_ENDPOINT[scope], {
        params: buildProjectHealthRequestParams(status, pageParam),
        headers: { 'Cache-Control': 'no-store' },
      })
      return data.data as OrgProjectHealthPage
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: getProjectHealthNextPageParam,
    enabled: !!orgId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })
}
