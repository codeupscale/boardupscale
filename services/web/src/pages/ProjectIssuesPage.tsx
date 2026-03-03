import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProject } from '@/hooks/useProjects'
import { useProjects } from '@/hooks/useProjects'
import { useIssues, useCreateIssue } from '@/hooks/useIssues'
import { useBoard } from '@/hooks/useBoard'
import { useSprints } from '@/hooks/useSprints'
import { useUsers } from '@/hooks/useUsers'
import { useSelectionStore } from '@/store/selection.store'
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
import { BulkActionsBar } from '@/components/issues/bulk-actions-bar'

export function ProjectIssuesPage() {
  const { t } = useTranslation()
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
  const { data: projects } = useProjects()
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

  const selectedIssueIds = useSelectionStore((s) => s.selectedIssueIds)
  const selectAll = useSelectionStore((s) => s.selectAll)
  const clearSelection = useSelectionStore((s) => s.clearSelection)

  const issues = issuesData?.data || []
  const total = issuesData?.total || 0
  const totalPages = Math.ceil(total / 25)

  const allIssueIds = issues.map((i) => i.id)
  const allSelected = allIssueIds.length > 0 && allIssueIds.every((id) => selectedIssueIds.has(id))
  const someSelected = allIssueIds.some((id) => selectedIssueIds.has(id))

  // Clear selection when page or filters change
  useEffect(() => {
    clearSelection()
  }, [page, filterType, filterPriority, filterStatus, filterAssignee, filterSprint, search, clearSelection])

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('nav.issues')}
        breadcrumbs={[
          { label: t('nav.projects'), href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectId}/board` },
          { label: t('nav.issues') },
        ]}
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            {t('issues.createIssue')}
          </Button>
        }
      />

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-48">
            <Input
              placeholder={t('issues.searchIssues')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>

          <Select
            options={[
              { value: '', label: t('issues.allTypes') },
              { value: IssueType.EPIC, label: t('issues.epic') },
              { value: IssueType.STORY, label: t('issues.story') },
              { value: IssueType.TASK, label: t('issues.task') },
              { value: IssueType.BUG, label: t('issues.bug') },
              { value: IssueType.SUBTASK, label: t('issues.subtask') },
            ]}
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setPage(1) }}
            className="w-36"
          />

          <Select
            options={[
              { value: '', label: t('issues.allPriorities') },
              { value: IssuePriority.CRITICAL, label: t('priorities.critical') },
              { value: IssuePriority.HIGH, label: t('priorities.high') },
              { value: IssuePriority.MEDIUM, label: t('priorities.medium') },
              { value: IssuePriority.LOW, label: t('priorities.low') },
            ]}
            value={filterPriority}
            onChange={(e) => { setFilterPriority(e.target.value); setPage(1) }}
            className="w-40"
          />

          <Select
            options={[
              { value: '', label: t('issues.allStatuses') },
              ...(board?.statuses?.map((s) => ({ value: s.id, label: s.name })) || []),
            ]}
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
            className="w-40"
          />

          <Select
            options={[
              { value: '', label: t('issues.allAssignees') },
              ...(users?.map((u) => ({ value: u.id, label: u.displayName })) || []),
            ]}
            value={filterAssignee}
            onChange={(e) => { setFilterAssignee(e.target.value); setPage(1) }}
            className="w-40"
          />

          {sprints && sprints.length > 0 && (
            <Select
              options={[
                { value: '', label: t('issues.allSprints') },
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
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">{t('common.title')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-28">{t('common.priority')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-36">{t('common.status')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-16">{t('common.assignee')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-28">{t('issues.dueDate')}</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 w-16">SP</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <IssueTableRow key={issue.id} issue={issue} selectable />
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <span className="text-sm text-gray-500">
                  {t('common.showing', { from: (page - 1) * 25 + 1, to: Math.min(page * 25, total), total })}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    {t('common.previous')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            title={t('issues.noIssues')}
            description={t('issues.noIssuesFilter')}
            action={{ label: t('issues.createIssue'), onClick: () => setShowCreate(true) }}
          />
        )}
      </div>

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        statuses={board?.statuses}
        users={users}
        projects={projects}
        sprints={sprints?.map((s) => ({ id: s.id, name: s.name }))}
        projectId={projectId}
      />

      <Dialog open={showCreate} onClose={() => setShowCreate(false)} className="max-w-2xl">
        <DialogHeader onClose={() => setShowCreate(false)}>
          <DialogTitle>{t('issues.createIssue')}</DialogTitle>
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
