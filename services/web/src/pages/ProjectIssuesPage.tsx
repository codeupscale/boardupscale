import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Download, Bookmark, BookmarkPlus, X } from 'lucide-react'
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
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { DropdownMenu, DropdownItem } from '@/components/ui/dropdown-menu'
import { IssueForm, IssueFormHandle } from '@/components/issues/issue-form'
import { IssueTableRow } from '@/components/issues/issue-table-row'
import { BulkActionsBar } from '@/components/issues/bulk-actions-bar'
import { useExportIssues } from '@/hooks/useReports'
import { useSavedViews, useCreateSavedView, useDeleteSavedView } from '@/hooks/useSavedViews'
import { useAuthStore } from '@/store/auth.store'
import { Pagination } from '@/components/ui/pagination'

export function ProjectIssuesPage() {
  const { t } = useTranslation()
  const { key: projectKey } = useParams<{ key: string }>()
  const [showCreate, setShowCreate] = useState(false)
  const issueFormRef = useRef<IssueFormHandle>(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterSprint, setFilterSprint] = useState('')
  const [page, setPage] = useState(1)
  const [saveViewName, setSaveViewName] = useState('')
  const [showSaveViewInput, setShowSaveViewInput] = useState(false)
  const [activeViewId, setActiveViewId] = useState<string | null>(null)

  const currentUser = useAuthStore((s) => s.user)
  const { data: project } = useProject(projectKey!)
  const { data: projectsResult } = useProjects()
  const projects = projectsResult?.data
  const { data: board } = useBoard(projectKey!)
  const { data: sprints } = useSprints(projectKey!)
  const { data: usersResult } = useUsers()
  const users = usersResult?.data
  const { data: issuesData, isLoading } = useIssues({
    projectId: projectKey!,
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
  const { exportCsv, exportJson } = useExportIssues(projectKey || '')
  const [exporting, setExporting] = useState(false)
  const { data: savedViews } = useSavedViews(project?.id || '')
  const createView = useCreateSavedView(project?.id || '')
  const deleteView = useDeleteSavedView(project?.id || '')

  const handleExport = async (format: 'csv' | 'json') => {
    setExporting(true)
    try {
      if (format === 'csv') {
        await exportCsv()
      } else {
        await exportJson()
      }
    } finally {
      setExporting(false)
    }
  }

  const hasActiveFilters = !!(search || filterType || filterPriority || filterStatus || filterAssignee || filterSprint)

  const applyView = (view: { id: string; filters: { search?: string; type?: string; priority?: string; statusId?: string; assigneeId?: string; sprintId?: string } }) => {
    setSearch(view.filters.search || '')
    setFilterType(view.filters.type || '')
    setFilterPriority(view.filters.priority || '')
    setFilterStatus(view.filters.statusId || '')
    setFilterAssignee(view.filters.assigneeId || '')
    setFilterSprint(view.filters.sprintId || '')
    setActiveViewId(view.id)
    setPage(1)
  }

  const handleSaveView = () => {
    if (!saveViewName.trim()) return
    createView.mutate(
      {
        name: saveViewName.trim(),
        filters: {
          search: search || undefined,
          type: filterType || undefined,
          priority: filterPriority || undefined,
          statusId: filterStatus || undefined,
          assigneeId: filterAssignee || undefined,
          sprintId: filterSprint || undefined,
        },
        isShared: false,
      },
      {
        onSuccess: (view) => {
          setActiveViewId(view.id)
          setShowSaveViewInput(false)
          setSaveViewName('')
        },
      },
    )
  }

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

  // Clear active view indicator when filters are manually changed after applying a view
  useEffect(() => {
    if (activeViewId) {
      const activeView = savedViews?.find((v) => v.id === activeViewId)
      if (activeView) {
        const f = activeView.filters
        const matches =
          (f.search || '') === search &&
          (f.type || '') === filterType &&
          (f.priority || '') === filterPriority &&
          (f.statusId || '') === filterStatus &&
          (f.assigneeId || '') === filterAssignee &&
          (f.sprintId || '') === filterSprint
        if (!matches) setActiveViewId(null)
      }
    }
  }, [search, filterType, filterPriority, filterStatus, filterAssignee, filterSprint, activeViewId, savedViews])

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('nav.issues')}
        breadcrumbs={[
          { label: t('nav.projects'), href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectKey}/board` },
          { label: t('nav.issues') },
        ]}
        actions={
          <div className="flex gap-2">
            <DropdownMenu
              trigger={
                <Button size="sm" variant="outline" disabled={exporting}>
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              }
            >
              <DropdownItem
                icon={<Download className="h-4 w-4" />}
                onClick={() => handleExport('csv')}
              >
                Export CSV
              </DropdownItem>
              <DropdownItem
                icon={<Download className="h-4 w-4" />}
                onClick={() => handleExport('json')}
              >
                Export JSON
              </DropdownItem>
            </DropdownMenu>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              {t('issues.createIssue')}
            </Button>
          </div>
        }
      />

      <ProjectTabNav projectKey={projectKey!} />

      <div className="p-6 space-y-4 flex-1 overflow-y-auto">
        {/* Filters card */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50 p-4 space-y-3 shadow-sm">
          {/* Stats strip */}
          {total > 0 && (
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
              {total} issue{total !== 1 ? 's' : ''}
            </p>
          )}
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
              value={filterType || '__all__'}
              onValueChange={(v) => { setFilterType(v === '__all__' ? '' : v); setPage(1) }}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('issues.allTypes')}</SelectItem>
                <SelectItem value={IssueType.EPIC}>{t('issues.epic')}</SelectItem>
                <SelectItem value={IssueType.STORY}>{t('issues.story')}</SelectItem>
                <SelectItem value={IssueType.TASK}>{t('issues.task')}</SelectItem>
                <SelectItem value={IssueType.BUG}>{t('issues.bug')}</SelectItem>
                <SelectItem value={IssueType.SUBTASK}>{t('issues.subtask')}</SelectItem>
              </SelectContent>
            </Select>

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

            <Select
              value={filterStatus || '__all__'}
              onValueChange={(v) => { setFilterStatus(v === '__all__' ? '' : v); setPage(1) }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('issues.allStatuses')}</SelectItem>
                {board?.statuses?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filterAssignee || '__all__'}
              onValueChange={(v) => { setFilterAssignee(v === '__all__' ? '' : v); setPage(1) }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('issues.allAssignees')}</SelectItem>
                {users?.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {sprints && sprints.length > 0 && (
              <Select
                value={filterSprint || '__all__'}
                onValueChange={(v) => { setFilterSprint(v === '__all__' ? '' : v); setPage(1) }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('issues.allSprints')}</SelectItem>
                  {sprints?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Saved Views */}
        {((savedViews && savedViews.length > 0) || hasActiveFilters) && (
          <div className="flex flex-wrap items-center gap-2 py-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1 shrink-0">
              <Bookmark className="h-3 w-3" />
              Saved Views:
            </span>

            {savedViews?.map((view) => (
              <div
                key={view.id}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border cursor-pointer transition-colors ${
                  activeViewId === view.id
                    ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-300'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <button onClick={() => applyView(view)} className="max-w-32 truncate">
                  {view.name}
                  {view.isShared && <span className="ml-1 opacity-60">·shared</span>}
                </button>
                {view.creatorId === currentUser?.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteView.mutate(view.id, {
                        onSuccess: () => { if (activeViewId === view.id) setActiveViewId(null) },
                      })
                    }}
                    className="ml-0.5 hover:text-red-500 transition-colors"
                    title="Delete view"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}

            {hasActiveFilters && !showSaveViewInput && (
              <button
                onClick={() => setShowSaveViewInput(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors"
              >
                <BookmarkPlus className="h-3 w-3" />
                Save view
              </button>
            )}

            {showSaveViewInput && (
              <div className="flex items-center gap-2">
                <Input
                  value={saveViewName}
                  onChange={(e) => setSaveViewName(e.target.value)}
                  placeholder="View name..."
                  className="h-7 text-xs w-40 py-0"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveView()
                    if (e.key === 'Escape') { setShowSaveViewInput(false); setSaveViewName('') }
                  }}
                />
                <Button
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={handleSaveView}
                  disabled={!saveViewName.trim() || createView.isPending}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2.5"
                  onClick={() => { setShowSaveViewInput(false); setSaveViewName('') }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <LoadingPage />
        ) : issues.length > 0 ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm">
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected
                      }}
                      onChange={() => selectAll(allIssueIds)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      aria-label="Select all issues"
                    />
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-32">Key</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('common.title')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-28">{t('common.priority')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-36">{t('common.status')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-16">{t('common.assignee')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-28">{t('issues.dueDate')}</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-16">SP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {issues.map((issue) => (
                  <IssueTableRow key={issue.id} issue={issue} selectable />
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={25}
              onPageChange={setPage}
            />
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
        projectId={projectKey}
      />

      <Dialog open={showCreate} onOpenChange={(o) => !o && issueFormRef.current?.requestClose()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('issues.createIssue')}</DialogTitle>
          </DialogHeader>
          <IssueForm
            ref={issueFormRef}
            projectId={project?.id || projectKey!}
            statuses={board?.statuses?.map((s) => ({ id: s.id, name: s.name }))}
            sprints={sprints?.map((s) => ({ id: s.id, name: s.name }))}
            parentIssues={(issuesData?.data || []).map((i) => ({
              id: i.id,
              key: i.key,
              title: i.title,
              type: i.type,
            }))}
            users={users || []}
            onSubmit={(values) =>
              createIssue.mutate(
                { ...values, projectId: project?.id || projectKey! } as any,
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
