import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Shield } from 'lucide-react'
import { useAuditLogs } from '@/hooks/useAuditLogs'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatRelativeTime } from '@/lib/utils'
import { LoadingPage } from '@/components/ui/spinner'

export function AuditLogPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const { data, isLoading } = useAuditLogs({
    entityType: entityType || undefined,
    action: action || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    limit: 20,
  })

  const logs = data?.data || []
  const meta = data?.meta

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">{t('audit.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('audit.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-border bg-muted/50 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t('audit.entityType')}
          </label>
          <select
            className="rounded-lg border border-border dark:border-gray-600 bg-card text-foreground px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(1) }}
          >
            <option value="">{t('audit.allTypes')}</option>
            <option value="user">User</option>
            <option value="project">Project</option>
            <option value="issue">Issue</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t('audit.action')}
          </label>
          <Input
            placeholder={t('audit.filterByAction')}
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
            className="w-48"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t('audit.startDate')}
          </label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t('audit.endDate')}
          </label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <LoadingPage />
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            {t('audit.noLogs')}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted border-b border-border sticky top-0">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('audit.when')}
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('audit.user')}
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('audit.action')}
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('audit.entityType')}
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('audit.details')}
                </th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('audit.ipAddress')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-accent/50">
                  <td className="px-6 py-3 text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(log.createdAt)}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Avatar user={log.user} size="xs" />
                      <span className="text-foreground">
                        {log.user?.displayName || 'System'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {log.entityType || '-'}
                  </td>
                  <td className="px-6 py-3 text-muted-foreground max-w-xs truncate">
                    {log.changes ? JSON.stringify(log.changes).substring(0, 100) : '-'}
                  </td>
                  <td className="px-6 py-3 text-muted-foreground text-xs font-mono">
                    {log.ipAddress || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="px-6 py-3 border-t border-border bg-card flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t('common.previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('common.pageOf', {
              page: meta.page,
              totalPages: meta.totalPages,
              total: meta.total,
            })}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('common.next')}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
