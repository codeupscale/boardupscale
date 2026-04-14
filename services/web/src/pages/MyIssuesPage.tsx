import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useIssues } from '@/hooks/useIssues'
import { useAuthStore } from '@/store/auth.store'
import { IssuePriority, IssueStatusCategory } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { IssueTableRow } from '@/components/issues/issue-table-row'
import { CircleDot, AlertCircle, Clock, CheckCircle, ListFilter } from 'lucide-react'
import { cn } from '@/lib/utils'

function StatPill({
  label,
  count,
  icon: Icon,
  color,
  active,
  onClick,
}: {
  label: string
  count: number
  icon: any
  color: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-all duration-200',
        active
          ? 'border-primary/50 dark:border-primary bg-primary/10 shadow-sm'
          : 'border-border/60 bg-card/50 hover:border-border hover:shadow-sm',
      )}
    >
      <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', color)}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="text-left">
        <p className="text-lg font-bold text-foreground">{count}</p>
        <p className="text-xs text-muted-foreground -mt-0.5">{label}</p>
      </div>
    </button>
  )
}

export function MyIssuesPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [filterPriority, setFilterPriority] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [page, setPage] = useState(1)

  const { data: issuesData, isLoading } = useIssues({
    assigneeId: user?.id,
    priority: filterPriority || undefined,
    page,
    limit: 25,
  })

  const issues = issuesData?.data || []
  const total = issuesData?.total || 0
  const totalPages = Math.ceil(total / 25)

  // Filter by category client-side (since API may not support it directly)
  const filtered = filterCategory
    ? issues.filter((i) => i.status?.category === filterCategory)
    : issues

  const todoCount = issues.filter((i) => i.status?.category === IssueStatusCategory.TODO).length
  const inProgressCount = issues.filter((i) => i.status?.category === IssueStatusCategory.IN_PROGRESS).length
  const doneCount = issues.filter((i) => i.status?.category === IssueStatusCategory.DONE).length

  const handleCategoryClick = (category: string) => {
    setFilterCategory((prev) => (prev === category ? '' : category))
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={t('nav.myIssues')} />

      <div className="p-6 lg:p-8 space-y-5 max-w-[1400px] mx-auto w-full">
        {/* Stats Row */}
        <div className="flex flex-wrap gap-3">
          <StatPill
            label="Total"
            count={total}
            icon={CircleDot}
            color="bg-muted-foreground/30"
            active={!filterCategory}
            onClick={() => setFilterCategory('')}
          />
          <StatPill
            label={t('settings.toDo')}
            count={todoCount}
            icon={AlertCircle}
            color="bg-amber-500"
            active={filterCategory === IssueStatusCategory.TODO}
            onClick={() => handleCategoryClick(IssueStatusCategory.TODO)}
          />
          <StatPill
            label={t('settings.inProgress')}
            count={inProgressCount}
            icon={Clock}
            color="bg-primary"
            active={filterCategory === IssueStatusCategory.IN_PROGRESS}
            onClick={() => handleCategoryClick(IssueStatusCategory.IN_PROGRESS)}
          />
          <StatPill
            label={t('settings.done')}
            count={doneCount}
            icon={CheckCircle}
            color="bg-emerald-500"
            active={filterCategory === IssueStatusCategory.DONE}
            onClick={() => handleCategoryClick(IssueStatusCategory.DONE)}
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
            <ListFilter className="h-4 w-4 text-muted-foreground" />
          </div>
          <Select
            value={filterPriority || '__all__'}
            onValueChange={(v) => { setFilterPriority(v === '__all__' ? '' : v); setPage(1) }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('issues.allPriorities')}</SelectItem>
              <SelectItem value={IssuePriority.CRITICAL}>{t('priorities.critical')}</SelectItem>
              <SelectItem value={IssuePriority.HIGH}>{t('priorities.high')}</SelectItem>
              <SelectItem value={IssuePriority.MEDIUM}>{t('priorities.medium')}</SelectItem>
              <SelectItem value={IssuePriority.LOW}>{t('priorities.low')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <LoadingPage />
        ) : filtered.length > 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card/50 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/80">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-32">Key</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-40">{t('nav.projects', 'Project')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('common.title')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">{t('common.priority')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-36">{t('common.status')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">{t('common.assignee')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">{t('issues.dueDate')}</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">SP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.map((issue) => (
                  <IssueTableRow key={issue.id} issue={issue} showProject />
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/50">
                <span className="text-sm text-muted-foreground">
                  {t('common.pageOf', { page, totalPages, total })}
                </span>
                <div className="flex gap-2">
                  <button
                    className="px-3.5 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-muted disabled:opacity-40 text-foreground transition-colors"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    {t('common.previous')}
                  </button>
                  <button
                    className="px-3.5 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-muted disabled:opacity-40 text-foreground transition-colors"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t('common.next')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={<CircleDot className="h-12 w-12" />}
            title={t('dashboard.noIssuesAssigned')}
            description={t('dashboard.issuesAssignedAppear')}
          />
        )}
      </div>
    </div>
  )
}
