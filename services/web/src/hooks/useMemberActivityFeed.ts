import { useInfiniteQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import {
  buildActivityFeedRequestParams,
  getActivityFeedNextPageParam,
  type MemberActivityFeedPage,
} from '@/hooks/activity-feed-query'

export {
  MEMBER_ACTIVITY_PAGE_SIZE,
  MEMBER_ACTIVITY_PREFETCH_ROWS,
  buildActivityFeedRequestParams,
  getActivityFeedNextPageParam,
  flattenActivityFeedPages,
  resolveActivityFeedViewState,
  shouldFetchNextActivityPage,
  type MemberActivityFeedPage,
  type ActivityFeedViewState,
} from '@/hooks/activity-feed-query'

/**
 * Keyset-paged "Recent Project Activity" for infinite scroll — mirrors
 * useOrgProjectHealth's pattern. Independent of useMemberDashboard's
 * fixed-budget aggregate call; optionally narrowed to one project.
 */
export function useMemberActivityFeed(projectId?: string) {
  const orgId = useAuthStore((s) => s.user?.organizationId)

  return useInfiniteQuery({
    queryKey: ['dashboard', 'member', 'activity', orgId, projectId ?? 'all'],
    queryFn: async ({ pageParam }): Promise<MemberActivityFeedPage> => {
      const { data } = await api.get('/dashboard/member/activity', {
        params: buildActivityFeedRequestParams(projectId, pageParam),
        headers: { 'Cache-Control': 'no-store' },
      })
      return data.data as MemberActivityFeedPage
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: getActivityFeedNextPageParam,
    enabled: !!orgId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })
}
