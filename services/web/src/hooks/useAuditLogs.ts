import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { AuditLogEntry } from '@/types'

interface AuditLogsFilters {
  entityType?: string
  action?: string
  userId?: string
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
}

interface AuditLogsResponse {
  data: AuditLogEntry[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export function useAuditLogs(filters: AuditLogsFilters = {}) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: async () => {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''),
      )
      const { data } = await api.get('/admin/audit-logs', { params })
      return data as AuditLogsResponse
    },
  })
}
