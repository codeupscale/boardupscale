import { describe, expect, it } from 'vitest'
import type { ProjectHealthRow } from '@/hooks/useOrgDashboard'
import {
  buildProjectHealthRequestParams,
  flattenProjectHealthPages,
  getProjectHealthNextPageParam,
  PROJECT_HEALTH_PAGE_SIZE,
  resolveProjectHealthViewState,
  shouldFetchNextProjectHealthPage,
  type OrgProjectHealthPage,
} from '@/hooks/project-health-query'

function row(id: string): ProjectHealthRow {
  return {
    projectId: id,
    name: id,
    key: id.slice(0, 4).toUpperCase(),
    type: 'scrum',
    openIssues: 1,
    blockedIssues: 0,
    overdueIssues: 0,
    doneIssues: 0,
    activeSprintName: null,
    status: 'active',
    progressPercent: 0,
  }
}

function page(
  items: ProjectHealthRow[],
  nextCursor: string | null,
  total = items.length,
): OrgProjectHealthPage {
  return { items, nextCursor, total }
}

describe('buildProjectHealthRequestParams', () => {
  it('omits cursor on the first page', () => {
    expect(buildProjectHealthRequestParams('all')).toEqual({
      status: 'all',
      limit: PROJECT_HEALTH_PAGE_SIZE,
    })
  })

  it('includes cursor for subsequent pages and preserves status filter', () => {
    expect(buildProjectHealthRequestParams('at_risk', 'cursor-abc')).toEqual({
      status: 'at_risk',
      limit: PROJECT_HEALTH_PAGE_SIZE,
      cursor: 'cursor-abc',
    })
  })
})

describe('getProjectHealthNextPageParam', () => {
  it('returns the next cursor when present', () => {
    expect(
      getProjectHealthNextPageParam(page([row('a')], 'next-1', 40)),
    ).toBe('next-1')
  })

  it('returns undefined when nextCursor is null (terminal page)', () => {
    expect(
      getProjectHealthNextPageParam(page([row('a')], null, 1)),
    ).toBeUndefined()
  })
})

describe('flattenProjectHealthPages', () => {
  it('flattens multi-page items in order', () => {
    const pages = [
      page([row('a'), row('b')], 'c2', 3),
      page([row('c')], null, 3),
    ]
    expect(flattenProjectHealthPages(pages).map((r) => r.projectId)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('returns empty list when pages are missing', () => {
    expect(flattenProjectHealthPages(undefined)).toEqual([])
  })
})

describe('resolveProjectHealthViewState', () => {
  it('maps loading / error / empty / ready', () => {
    expect(
      resolveProjectHealthViewState({
        isLoading: true,
        isError: false,
        rowsLength: 0,
      }),
    ).toBe('loading')
    expect(
      resolveProjectHealthViewState({
        isLoading: false,
        isError: true,
        rowsLength: 0,
      }),
    ).toBe('error')
    expect(
      resolveProjectHealthViewState({
        isLoading: false,
        isError: false,
        rowsLength: 0,
      }),
    ).toBe('empty')
    expect(
      resolveProjectHealthViewState({
        isLoading: false,
        isError: false,
        rowsLength: 2,
      }),
    ).toBe('ready')
  })

  it('prefers loading over error while the first fetch is in flight', () => {
    expect(
      resolveProjectHealthViewState({
        isLoading: true,
        isError: true,
        rowsLength: 0,
      }),
    ).toBe('loading')
  })
})

describe('shouldFetchNextProjectHealthPage', () => {
  it('fetches when the last visible row is within the prefetch window', () => {
    expect(
      shouldFetchNextProjectHealthPage({
        lastVisibleIndex: 20,
        rowsLength: 25,
        hasNextPage: true,
        isFetchingNextPage: false,
      }),
    ).toBe(true)
  })

  it('does not fetch when still far from the end', () => {
    expect(
      shouldFetchNextProjectHealthPage({
        lastVisibleIndex: 5,
        rowsLength: 25,
        hasNextPage: true,
        isFetchingNextPage: false,
      }),
    ).toBe(false)
  })

  it('does not fetch while a page is already loading or no next page', () => {
    expect(
      shouldFetchNextProjectHealthPage({
        lastVisibleIndex: 24,
        rowsLength: 25,
        hasNextPage: true,
        isFetchingNextPage: true,
      }),
    ).toBe(false)
    expect(
      shouldFetchNextProjectHealthPage({
        lastVisibleIndex: 24,
        rowsLength: 25,
        hasNextPage: false,
        isFetchingNextPage: false,
      }),
    ).toBe(false)
  })

  it('does not fetch when there is no visible row yet', () => {
    expect(
      shouldFetchNextProjectHealthPage({
        lastVisibleIndex: undefined,
        rowsLength: 25,
        hasNextPage: true,
        isFetchingNextPage: false,
      }),
    ).toBe(false)
  })
})
