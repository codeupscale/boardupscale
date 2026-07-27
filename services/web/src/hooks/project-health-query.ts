import type {
  ProjectHealthRow,
  ProjectHealthStatus,
} from '@/hooks/useOrgDashboard'

export const PROJECT_HEALTH_PAGE_SIZE = 25
/** Viewport shows ~10 rows before scrolling. */
export const PROJECT_HEALTH_VIEWPORT_ROWS = 10
export const PROJECT_HEALTH_ROW_HEIGHT_PX = 48
export const PROJECT_HEALTH_HEADER_HEIGHT_PX = 40
/** Fetch next API page when the last visible row is within this many of the end. */
export const PROJECT_HEALTH_PREFETCH_ROWS = 5

export interface OrgProjectHealthPage {
  items: ProjectHealthRow[]
  nextCursor: string | null
  total: number
}

export type ProjectHealthViewState =
  | 'loading'
  | 'error'
  | 'empty'
  | 'ready'

export function buildProjectHealthRequestParams(
  status: ProjectHealthStatus | 'all',
  pageParam?: string,
): {
  status: ProjectHealthStatus | 'all'
  limit: number
  cursor?: string
} {
  return {
    status,
    limit: PROJECT_HEALTH_PAGE_SIZE,
    ...(pageParam ? { cursor: pageParam } : {}),
  }
}

export function getProjectHealthNextPageParam(
  last: OrgProjectHealthPage,
): string | undefined {
  return last.nextCursor ?? undefined
}

export function flattenProjectHealthPages(
  pages: OrgProjectHealthPage[] | undefined,
): ProjectHealthRow[] {
  return pages?.flatMap((p) => p.items) ?? []
}

export function resolveProjectHealthViewState(input: {
  isLoading: boolean
  isError: boolean
  rowsLength: number
}): ProjectHealthViewState {
  if (input.isLoading) return 'loading'
  if (input.isError) return 'error'
  if (input.rowsLength === 0) return 'empty'
  return 'ready'
}

export function shouldFetchNextProjectHealthPage(input: {
  lastVisibleIndex: number | undefined
  rowsLength: number
  hasNextPage: boolean
  isFetchingNextPage: boolean
  prefetchRows?: number
}): boolean {
  const { lastVisibleIndex, rowsLength, hasNextPage, isFetchingNextPage } =
    input
  if (
    lastVisibleIndex === undefined ||
    rowsLength === 0 ||
    !hasNextPage ||
    isFetchingNextPage
  ) {
    return false
  }
  const prefetch = input.prefetchRows ?? PROJECT_HEALTH_PREFETCH_ROWS
  return lastVisibleIndex >= rowsLength - prefetch
}
