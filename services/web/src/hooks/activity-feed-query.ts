import type { ActivityFeedItem } from '@/hooks/useOrgDashboard'

/** Mirrors project-health-query.ts's pagination constants/helpers for the "Recent Project Activity" infinite scroll. */
export const MEMBER_ACTIVITY_PAGE_SIZE = 20
/** Fetch next API page when the last visible row is within this many of the end. */
export const MEMBER_ACTIVITY_PREFETCH_ROWS = 5

export interface MemberActivityFeedPage {
  items: ActivityFeedItem[]
  nextCursor: string | null
}

export type ActivityFeedViewState = 'loading' | 'error' | 'empty' | 'ready'

export function buildActivityFeedRequestParams(
  projectId: string | undefined,
  pageParam?: string,
): { projectId?: string; limit: number; cursor?: string } {
  return {
    ...(projectId ? { projectId } : {}),
    limit: MEMBER_ACTIVITY_PAGE_SIZE,
    ...(pageParam ? { cursor: pageParam } : {}),
  }
}

export function getActivityFeedNextPageParam(
  last: MemberActivityFeedPage,
): string | undefined {
  return last.nextCursor ?? undefined
}

export function flattenActivityFeedPages(
  pages: MemberActivityFeedPage[] | undefined,
): ActivityFeedItem[] {
  return pages?.flatMap((p) => p.items) ?? []
}

export function resolveActivityFeedViewState(input: {
  isLoading: boolean
  isError: boolean
  itemsLength: number
}): ActivityFeedViewState {
  if (input.isLoading) return 'loading'
  if (input.isError) return 'error'
  if (input.itemsLength === 0) return 'empty'
  return 'ready'
}

export function shouldFetchNextActivityPage(input: {
  lastVisibleIndex: number | undefined
  itemsLength: number
  hasNextPage: boolean
  isFetchingNextPage: boolean
  prefetchRows?: number
}): boolean {
  const { lastVisibleIndex, itemsLength, hasNextPage, isFetchingNextPage } =
    input
  if (
    lastVisibleIndex === undefined ||
    itemsLength === 0 ||
    !hasNextPage ||
    isFetchingNextPage
  ) {
    return false
  }
  const prefetch = input.prefetchRows ?? MEMBER_ACTIVITY_PREFETCH_ROWS
  return lastVisibleIndex >= itemsLength - prefetch
}
