import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Shield, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuditLogs } from '@/hooks/useAuditLogs'
import { useUsers } from '@/hooks/useUsers'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatRelativeTime, formatDate } from '@/lib/utils'
import { AuditLogEntry } from '@/types'

const ENTITY_TYPES = ['user', 'project', 'issue', 'comment', 'sprint', 'webhook']
const ACTIONS = [
  'user.registered',
  'user.login',
  'project.created',
  'project.updated',
  'project.archived',
  'issue.created',
  'issue.updated',
  'issue.deleted',
]

function formatAuditAction(entry: AuditLogEntry): string {
  const parts = entry.action.split('.')
  if (parts.length === 2) {
    return `${parts[0].charAt(0).toUpperCase() + parts[0].slice(1)} ${parts[1]}`
  }
  return entry.action
}

function AuditLogRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Avatar user={entry.user} size="xs" />
          <span className="text-sm text-gray-900">
            {entry.user?.displayName || 'System'}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          {formatAuditAction(entry)}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {entry.entityType && (
          <span className="capitalize">{entry.entityType}</span>
        )}
        {entry.entityId && (
          <span className="text-gray-400 text-xs ml-1 font-mono">
            {entry.entityId.slice(0, 8)}...
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {entry.ipAddress || '-'}
      </td>
      <td className="px-4 py-3 text-xs text-gray-400" title={formatDate(entry.createdAt)}>
        {formatRelativeTime(entry.createdAt)}
      </td>
      <td className="px-4 py-3">
        {entry.changes && Object.keys(entry.changes).length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
        )}
      </td>
    </tr>
  )
}

export function AuditLogPage() {
  const { t } = useTranslation()
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [userId, setUserId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)
  const limit = 25

  const { data: users } = useUsers()
  const { data: result, isLoading } = useAuditLogs({
    entityType: entityType || undefined,
    action: action || undefined,
    userId: userId || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    limit,
  })

  const entries = result?.data || []
  const meta = result?.meta

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
          <Shield className="h-5 w-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-sm text-gray-500">
            Track all actions and changes across your organization
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All Entity Types</option>
            {ENTITY_TYPES.map((et) => (
              <option key={et} value={et}>
                {et.charAt(0).toUpperCase() + et.slice(1)}
              </option>
            ))}
          </select>

          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All Actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All Users</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>

          <Input
            type="date"
            placeholder="Start date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              setPage(1)
            }}
          />

          <Input
            type="date"
            placeholder="End date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value)
              setPage(1)
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Entity
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  IP Address
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Changes
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    Loading audit logs...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No audit log entries found
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <AuditLogRow key={entry.id} entry={entry} />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Showing {(meta.page - 1) * meta.limit + 1} to{' '}
              {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} entries
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-gray-500">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= meta.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
