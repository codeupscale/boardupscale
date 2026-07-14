import { useCallback } from 'react'
import { useNavigate, useLocation, type Location } from 'react-router-dom'
import type { QueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Issue } from '@/types'
import { issueDetailPath } from '@/lib/routes'

export const ISSUE_MODAL_BACKGROUND_KEY = 'backgroundLocation'

export type IssueModalLocationState = {
  [ISSUE_MODAL_BACKGROUND_KEY]?: Location
}

/**
 * Resolves the page that should stay visible behind the ticket modal.
 *
 * When the user is already viewing a ticket modal (e.g. clicking a linked issue
 * from inside the modal), we keep the ORIGINAL background so nested navigation
 * doesn't stack `/issues/:id` routes on top of each other. Otherwise the current
 * page becomes the background.
 */
export function resolveIssueModalBackground(currentLocation: Location): Location {
  const existing = (currentLocation.state as IssueModalLocationState | null)?.[
    ISSUE_MODAL_BACKGROUND_KEY
  ]
  return existing ?? currentLocation
}

export function getIssueModalNavigateState(
  currentLocation: Location,
): IssueModalLocationState {
  return {
    [ISSUE_MODAL_BACKGROUND_KEY]: resolveIssueModalBackground(currentLocation),
  }
}

export function useOpenIssue() {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(
    (issueId: string) => {
      navigate(issueDetailPath(issueId), {
        state: getIssueModalNavigateState(location),
      })
    },
    [navigate, location],
  )
}

export function useCloseIssueModal() {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(() => {
    const background = (location.state as IssueModalLocationState | null)?.[
      ISSUE_MODAL_BACKGROUND_KEY
    ]

    if (background) {
      navigate(`${background.pathname}${background.search}${background.hash}`, {
        replace: true,
      })
      return
    }

    if (window.history.length > 1) {
      navigate(-1)
      return
    }

    navigate('/dashboard')
  }, [navigate, location.state])
}

export function prefetchIssue(queryClient: QueryClient, issueId: string) {
  return queryClient.prefetchQuery({
    queryKey: ['issue', issueId],
    queryFn: async () => {
      const { data } = await api.get(`/issues/${issueId}`)
      return data.data as Issue
    },
    staleTime: 30_000,
  })
}
