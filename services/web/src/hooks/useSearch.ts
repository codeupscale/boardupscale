import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import api from '@/lib/api'

export const SEARCH_LIMIT_PER_CATEGORY = 10

export interface SearchHighlight {
  field: string
  snippets: string[]
}

export interface SearchIssueItem {
  kind: 'issue'
  id: string
  key: string
  title: string
  type: string
  priority: string
  projectId: string
  projectKey?: string
  projectName?: string
  statusName?: string
  assigneeName?: string
  highlights?: SearchHighlight[]
  matchedFormerKey?: string
}

export interface SearchProjectItem {
  kind: 'project'
  id: string
  key: string
  name: string
  type: string
  color?: string
  iconUrl?: string
  highlights?: SearchHighlight[]
  matchedFormerKey?: string
}

export interface SearchMemberItem {
  kind: 'member'
  id: string
  displayName: string
  email: string
  avatarUrl?: string
  contextProjectKey?: string
  highlights?: SearchHighlight[]
}

export type SearchResultItem = SearchIssueItem | SearchProjectItem | SearchMemberItem

export interface GlobalSearchResponse {
  issues: SearchIssueItem[]
  projects: SearchProjectItem[]
  members: SearchMemberItem[]
  totals: {
    issues: number
    projects: number
    members: number
  }
  source: 'elasticsearch' | 'postgresql'
}

/** @deprecated Use SearchIssueItem — kept for similar-issues panel */
export type SearchResultItemLegacy = SearchIssueItem

/**
 * Find similar/duplicate issues based on title text.
 * Uses 500ms debounce and requires at least 8 chars.
 */
export function useSimilarIssues(text: string, projectId?: string, excludeIssueId?: string) {
  const [debouncedText, setDebouncedText] = useState(text)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedText(text), 500)
    return () => clearTimeout(t)
  }, [text])

  return useQuery<{ items: SearchIssueItem[]; total: number; source: 'elasticsearch' | 'postgresql' }>({
    queryKey: ['search-similar', debouncedText, projectId, excludeIssueId],
    queryFn: async () => {
      const { data } = await api.get('/search/similar', {
        params: {
          text: debouncedText,
          projectId,
          excludeIssueId,
          limit: 5,
        },
      })
      return {
        items: data.data || [],
        total: data.meta?.total || 0,
        source: data.meta?.source || 'postgresql',
      }
    },
    enabled: debouncedText.length >= 8,
  })
}

export function useSearch(query: string, projectId?: string) {
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  return useQuery<GlobalSearchResponse>({
    queryKey: ['search', debouncedQuery, projectId],
    queryFn: async () => {
      const { data } = await api.get('/search', {
        params: { q: debouncedQuery, projectId, limit: SEARCH_LIMIT_PER_CATEGORY },
      })
      return {
        issues: data.data?.issues || [],
        projects: data.data?.projects || [],
        members: data.data?.members || [],
        totals: data.meta?.totals || { issues: 0, projects: 0, members: 0 },
        source: data.meta?.source || 'postgresql',
      }
    },
    enabled: debouncedQuery.length >= 2,
  })
}

export function getMemberSearchPath(
  member: SearchMemberItem,
  canOpenOrgTeam: boolean,
): string | null {
  if (member.contextProjectKey) {
    return `/projects/${member.contextProjectKey}/settings`
  }
  if (canOpenOrgTeam) {
    return '/settings/team'
  }
  return null
}

export function flattenSearchResults(data?: GlobalSearchResponse): SearchResultItem[] {
  if (!data) return []
  return [...data.issues, ...data.projects, ...data.members]
}
