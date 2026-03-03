import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import api from '@/lib/api'
import { UserPermission } from '@/types'

/**
 * Fetches the current user's permissions for a specific project.
 * Returns a helper function `hasPermission(resource, action)` for
 * conditionally rendering UI elements based on access.
 */
export function useHasPermission(projectId: string | undefined) {
  const { data: permissions = [], isLoading } = useQuery({
    queryKey: ['my-permissions', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/my-permissions`)
      return data.data as UserPermission[]
    },
    enabled: !!projectId,
    staleTime: 60_000, // cache for 1 minute to avoid redundant calls
  })

  const hasPermission = useCallback(
    (resource: string, action: string): boolean => {
      return permissions.some(
        (p) => p.resource === resource && p.action === action,
      )
    },
    [permissions],
  )

  return {
    permissions,
    hasPermission,
    isLoading,
  }
}
