import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useProject } from '@/hooks/useProjects'
import { useIssues, useCreateIssue } from '@/hooks/useIssues'
import { useBoard } from '@/hooks/useBoard'
import { useSprints } from '@/hooks/useSprints'
import { useUsers } from '@/hooks/useUsers'
import { IssueType, IssuePriority } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { IssueForm } from '@/components/issues/issue-form'
import { IssueTableRow } from '@/components/issues/issue-table-row'

export function ProjectIssuesPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterSprint, setFilterSprint] = useState('')
  const [page, setPage] = useState(1)

  const { data: project } = useProject(projectId!)
  const { data: board } = useBoard(projectId!)
  const { data: sprints } = useSprints(projectId!)
  const { data: users } = useUsers()
  const { data: issuesData, isLoading } = useIssues({
    projectId: projectId!,
    search: search || undefined,
    type: filterType || undefined,
    priority: filterPriority || undefined,
    statusId: filterStatus || undefined,
    assigneeId: filterAssignee || undefined,
    sprintId: filterSprint || undefined,
    page,
    limit: 25,
  })
  const createIssue = useCreateIssue()

  const issues = issuesData?.data || []
  const total = issuesData?.total || 0
  const totalPages = Math.ceil(total / 25)

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Issues"
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectId}/board` },
          { label: 'Issues' },
        ]}
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Create Issue
          </Button>
        }
      />

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-48">
            <Input
              placeholder="Search issues..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>

          <Select
            options={[
              { value: '', label: 'All Types' },
              { value: IssueType.EPIC, label: 'Epic' },
              { value: IssueType.STORY, label: 'Story' },
              { value: IssueType.TASK, label: 'Task' },
              { value: IssueType.BUG, label: 'Bug' },
              { value: IssueType.SUBTASK, label: 'Subtask' },
            ]}
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setPage(1) }}
            className="w-36"
          />

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
              ...(board?.statuses?.map((s) => ({ value: s.id, label: s.name })) || []),
            ]}
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
            className="w-40"
          />

          <Select
            options={[
              { value: '', label: 'All Assignees' },
              ...(users?.map((u) => ({ value: u.id, label: u.displayName })) || []),
            ]}
            value={filterAssignee}
            onChange={(e) => { setFilterAssignee(e.target.value); setPage(1) }}
            className="w-40"
          />

          {sprints && sprints.length > 0 && (
            <Select
              options={[
                { value: '', label: 'All Sprints' },
                ...(sprints?.map((s) => ({ value: s.id, label: s.name })) || []),
              ]}
              value={filterSprint}
              onChange={(e) => { setFilterSprint(e.target.value); setPage(1) }}
              className="w-40"
            />
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <LoadingPage />
        ) : issues.length > 0 ? (
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
                {issues.map((issue) => (
                  <IssueTableRow key={issue.id} issue={issue} />
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <span className="text-sm text-gray-500">
                  Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total}
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
            title="No issues found"
            description="Try adjusting your filters or create a new issue."
            action={{ label: 'Create Issue', onClick: () => setShowCreate(true) }}
          />
        )}
      </div>

      <Dialog open={showCreate} onClose={() => setShowCreate(false)} className="max-w-2xl">
        <DialogHeader onClose={() => setShowCreate(false)}>
          <DialogTitle>Create Issue</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <IssueForm
            projectId={projectId!}
            statuses={board?.statuses?.map((s) => ({ id: s.id, name: s.name }))}
            sprints={sprints?.map((s) => ({ id: s.id, name: s.name }))}
            onSubmit={(values) =>
              createIssue.mutate(
                { ...values, projectId: projectId! } as any,
                { onSuccess: () => setShowCreate(false) },
              )
            }
            onCancel={() => setShowCreate(false)}
            isLoading={createIssue.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
