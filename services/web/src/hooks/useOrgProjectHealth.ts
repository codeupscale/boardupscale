import { useInfiniteQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import type {
  ProjectHealthRow,
  ProjectHealthStatus,
} from '@/hooks/useOrgDashboard'

export const PROJECT_HEALTH_PAGE_SIZE = 25
/** Viewport shows ~10 rows before scrolling. */
export const PROJECT_HEALTH_VIEWPORT_ROWS = 10
export const PROJECT_HEALTH_ROW_HEIGHT_PX = 48
export const PROJECT_HEALTH_HEADER_HEIGHT_PX = 40

export interface OrgProjectHealthPage {
  items: ProjectHealthRow[]
  nextCursor: string | null
  total: number
}

export function useOrgProjectHealth(
  status: ProjectHealthStatus | 'all' = 'all',
) {
  const orgId = useAuthStore((s) => s.user?.organizationId)

  return useInfiniteQuery({
    queryKey: ['dashboard', 'organization', 'project-health', orgId, status],
    queryFn: async ({ pageParam }): Promise<OrgProjectHealthPage> => {
      const { data } = await api.get('/dashboard/organization/project-health', {
        params: {
          status,
          limit: PROJECT_HEALTH_PAGE_SIZE,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        headers: { 'Cache-Control': 'no-store' },
      })
      return data.data as OrgProjectHealthPage
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!orgId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })
}
