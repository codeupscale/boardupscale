import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import api from '@/lib/api'

export function useSearch(query: string, projectId?: string) {
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  return useQuery({
    queryKey: ['search', debouncedQuery, projectId],
    queryFn: async () => {
      const { data } = await api.get('/search', {
        params: { q: debouncedQuery, projectId, limit: 10 },
      })
      return data.data
    },
    enabled: debouncedQuery.length >= 2,
  })
}
