import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Trash2, RotateCcw } from 'lucide-react'
import { useProject } from '@/hooks/useProjects'
import { useIssues } from '@/hooks/useIssues'
import { useBulkRestore, useBulkDelete } from '@/hooks/useBulkOperations'
import { useSelectionStore } from '@/store/selection.store'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { IssueTableRow } from '@/components/issues/issue-table-row'
import { ConfirmDialog } from '@/components/common/confirm-dialog'

export function ProjectTrashPage() {
  const { key: projectKey } = useParams<{ key: string }>()
  const [page, setPage] = useState(1)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const { data: project } = useProject(projectKey!)
  const { data: issuesData, isLoading } = useIssues({
    projectId: projectKey!,
    deleted: true,
    page,
    limit: 25,
  })
  const bulkRestore = useBulkRestore()

  const selectedIssueIds = useSelectionStore((s) => s.selectedIssueIds)
  const selectAll = useSelectionStore((s) => s.selectAll)
  const clearSelection = useSelectionStore((s) => s.clearSelection)

  const issues = issuesData?.data || []
  const total = issuesData?.total || 0
  const totalPages = Math.ceil(total / 25)

  const allIssueIds = issues.map((i) => i.id)
  const allSelected = allIssueIds.length > 0 && allIssueIds.every((id) => selectedIssueIds.has(id))
  const someSelected = allIssueIds.some((id) => selectedIssueIds.has(id))
  const count = selectedIssueIds.size

  // Clear selection on unmount
  useEffect(() => {
    return () => clearSelection()
  }, [clearSelection])

  const handleRestore = () => {
    const issueIds = Array.from(selectedIssueIds)
    bulkRestore.mutate({ issueIds })
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Trash"
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectKey}/board` },
          { label: 'Trash' },
        ]}
        actions={
          count > 0 ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRestore}
                isLoading={bulkRestore.isPending}
              >
                <RotateCcw className="h-4 w-4" />
                Restore {count} issue{count !== 1 ? 's' : ''}
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Trash2 className="h-4 w-4" />
          <span>Deleted issues are kept for 30 days before being permanently removed.</span>
        </div>

        {isLoading ? (
          <LoadingPage />
        ) : issues.length > 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected
                      }}
                      onChange={() => selectAll(allIssueIds)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-32">Key</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Title</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-28">Priority</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-36">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-16">Assignee</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-28">Deleted</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 w-16">SP</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <IssueTableRow key={issue.id} issue={issue} selectable showDeletedAt />
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <span className="text-sm text-gray-500">
                  Showing {(page - 1) * 25 + 1}--{Math.min(page * 25, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            title="Trash is empty"
            description="Deleted issues will appear here for 30 days before being permanently removed."
          />
        )}
      </div>
    </div>
  )
}
