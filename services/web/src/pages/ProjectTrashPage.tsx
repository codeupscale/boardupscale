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

export function TrashContent({ projectKey }: { projectKey: string }) {
  const [page, setPage] = useState(1)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const { data: issuesData, isLoading } = useIssues({
    projectId: projectKey,
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Trash2 className="h-4 w-4" />
          <span>Deleted issues are kept for 30 days before being permanently removed.</span>
        </div>
        {count > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleRestore}
            isLoading={bulkRestore.isPending}
          >
            <RotateCcw className="h-4 w-4" />
            Restore {count} issue{count !== 1 ? 's' : ''}
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingPage />
      ) : issues.length > 0 ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-muted">
                <th className="px-4 py-2.5 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected
                    }}
                    onChange={() => selectAll(allIssueIds)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
                  />
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-32">Key</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Title</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-28">Priority</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-36">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-16">Assignee</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-28">Deleted</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground w-16">SP</th>
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-sm text-muted-foreground">
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
  )
}

export function ProjectTrashPage() {
  const { key: projectKey } = useParams<{ key: string }>()
  const { data: project } = useProject(projectKey!)

  if (!projectKey) return null

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Trash"
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectKey}/board` },
          { label: 'Trash' },
        ]}
      />
      <div className="p-6">
        <TrashContent projectKey={projectKey} />
      </div>
    </div>
  )
}
