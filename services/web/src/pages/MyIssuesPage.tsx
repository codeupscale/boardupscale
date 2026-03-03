import { useState } from 'react'
import { useIssues } from '@/hooks/useIssues'
import { useAuthStore } from '@/store/auth.store'
import { useBoard } from '@/hooks/useBoard'
import { IssuePriority, IssueStatusCategory } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import { Select } from '@/components/ui/select'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { IssueTableRow } from '@/components/issues/issue-table-row'
import { CircleDot } from 'lucide-react'

export function MyIssuesPage() {
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

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="My Issues" />

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex gap-3">
          <Select
            options={[
              { value: '', label: 'All Priorities' },
              { value: IssuePriority.CRITICAL, label: 'Critical' },
              { value: IssuePriority.HIGH, label: 'High' },
              { value: IssuePriority.MEDIUM, label: 'Medium' },
              { value: IssuePriority.LOW, label: 'Low' },
            ]}
            value={filterPriority}
            onChange={(e) => { setFilterPriority(e.target.value); setPage(1) }}
            className="w-40"
          />

          <Select
            options={[
              { value: '', label: 'All Statuses' },
              { value: IssueStatusCategory.TODO, label: 'To Do' },
              { value: IssueStatusCategory.IN_PROGRESS, label: 'In Progress' },
              { value: IssueStatusCategory.DONE, label: 'Done' },
            ]}
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-40"
          />
        </div>

        {/* Issue stats */}
        <div className="flex gap-4">
          {[
            { label: 'Total', count: total, color: 'text-gray-700' },
            {
              label: 'To Do',
              count: issues.filter((i) => i.status?.category === IssueStatusCategory.TODO).length,
              color: 'text-gray-600',
            },
            {
              label: 'In Progress',
              count: issues.filter((i) => i.status?.category === IssueStatusCategory.IN_PROGRESS).length,
              color: 'text-blue-600',
            },
            {
              label: 'Done',
              count: issues.filter((i) => i.status?.category === IssueStatusCategory.DONE).length,
              color: 'text-green-600',
            },
          ].map(({ label, count, color }) => (
            <div
              key={label}
              className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center gap-2"
            >
              <span className={`text-lg font-bold ${color}`}>{count}</span>
              <span className="text-sm text-gray-500">{label}</span>
            </div>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <LoadingPage />
        ) : filtered.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-32">Key</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Title</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-28">Priority</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-36">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-16">Assignee</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-28">Due Date</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 w-16">SP</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((issue) => (
                  <IssueTableRow key={issue.id} issue={issue} />
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <span className="text-sm text-gray-500">
                  Page {page} of {totalPages} ({total} issues)
                </span>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={<CircleDot className="h-12 w-12" />}
            title="No issues assigned to you"
            description="Issues assigned to you across all projects will appear here."
          />
        )}
      </div>
    </div>
  )
}
