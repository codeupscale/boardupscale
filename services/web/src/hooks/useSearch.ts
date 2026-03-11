import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import api from '@/lib/api'

export interface SearchHighlight {
  field: string
  snippets: string[]
}

export interface SearchResultItem {
  id: string
  key: string
  title: string
  type: string
  priority: string
  projectId: string
  projectName?: string
  statusName?: string
  assigneeName?: string
  highlights?: SearchHighlight[]
}

export interface SearchResponse {
  items: SearchResultItem[]
  total: number
  source: 'elasticsearch' | 'postgresql'
}

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

  return useQuery<SearchResponse>({
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

  return useQuery<SearchResponse>({
    queryKey: ['search', debouncedQuery, projectId],
    queryFn: async () => {
      const { data } = await api.get('/search', {
        params: { q: debouncedQuery, projectId, limit: 10 },
      })
      return {
        items: data.data || [],
        total: data.meta?.total || 0,
        source: data.meta?.source || 'postgresql',
      }
    },
    enabled: debouncedQuery.length >= 2,
  })
}
