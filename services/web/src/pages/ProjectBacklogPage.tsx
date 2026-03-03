import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Play,
  CheckCircle,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProject, useProjects } from '@/hooks/useProjects'
import { useSprints, useCreateSprint, useStartSprint, useCompleteSprint, useDeleteSprint } from '@/hooks/useSprints'
import { useIssues, useCreateIssue } from '@/hooks/useIssues'
import { useBoard } from '@/hooks/useBoard'
import { useUsers } from '@/hooks/useUsers'
import { useSelectionStore } from '@/store/selection.store'
import { SprintStatus, Issue } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { IssueForm } from '@/components/issues/issue-form'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { IssueTableRow } from '@/components/issues/issue-table-row'
import { BulkActionsBar } from '@/components/issues/bulk-actions-bar'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

function SprintSection({
  sprint,
  issues,
  projectId,
  statuses,
  allSprints,
}: {
  sprint: any
  issues: Issue[]
  projectId: string
  statuses: any[]
  allSprints: any[]
}) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const [showConfirm, setShowConfirm] = useState<'start' | 'complete' | 'delete' | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const startSprint = useStartSprint()
  const completeSprint = useCompleteSprint()
  const deleteSprint = useDeleteSprint()

  const selectedIssueIds = useSelectionStore((s) => s.selectedIssueIds)
  const selectAll = useSelectionStore((s) => s.selectAll)

  const isActive = sprint.status === SprintStatus.ACTIVE

  const issueIds = issues.map((i) => i.id)
  const allSelected = issueIds.length > 0 && issueIds.every((id) => selectedIssueIds.has(id))
  const someSelected = issueIds.some((id) => selectedIssueIds.has(id))

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Sprint Header */}
      <div
        className={cn(
          'flex items-center justify-between px-4 py-3 cursor-pointer',
          isActive ? 'bg-blue-50 border-b border-blue-100' : 'bg-gray-50 border-b border-gray-100',
        )}
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
          <h3 className="text-sm font-semibold text-gray-900">{sprint.name}</h3>
          {isActive && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
              {t('sprints.active')}
            </span>
          )}
          <span className="text-xs text-gray-400">
            ({issues.length} {issues.length !== 1 ? t('nav.issues').toLowerCase() : t('projects.issue')})
          </span>
          {sprint.startDate && sprint.endDate && (
            <span className="text-xs text-gray-400">
              {formatDate(sprint.startDate)} — {formatDate(sprint.endDate)}
            </span>
          )}
        </div>
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {sprint.status === SprintStatus.PLANNED && (
            <Button size="sm" variant="outline" onClick={() => setShowConfirm('start')}>
              <Play className="h-3.5 w-3.5" />
              {t('sprints.startSprint')}
            </Button>
          )}
          {isActive && (
            <Button size="sm" variant="secondary" onClick={() => setShowConfirm('complete')}>
              <CheckCircle className="h-3.5 w-3.5" />
              {t('sprints.complete')}
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setShowConfirm('delete')}
            className="text-gray-400 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Issues */}
      {!collapsed && (
        <div>
          {issues.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected
                      }}
                      onChange={() => selectAll(issueIds)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th colSpan={6} />
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <IssueTableRow key={issue.id} issue={issue} selectable />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-6 text-center text-sm text-gray-400">
              {t('issues.noIssuesInSprint')}
            </div>
          )}
        </div>
      )}

      {/* Start Sprint Confirm */}
      <Dialog
        open={showConfirm === 'start'}
        onClose={() => setShowConfirm(null)}
        className="max-w-sm"
      >
        <DialogHeader onClose={() => setShowConfirm(null)}>
          <DialogTitle>{t('sprints.startSprint')}</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <Input
            label={t('sprints.startDate')}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            label={t('sprints.endDate')}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowConfirm(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              isLoading={startSprint.isPending}
              onClick={() =>
                startSprint.mutate(
                  { projectId, sprintId: sprint.id, startDate, endDate },
                  { onSuccess: () => setShowConfirm(null) },
                )
              }
            >
              {t('sprints.start')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showConfirm === 'complete'}
        onClose={() => setShowConfirm(null)}
        onConfirm={() =>
          completeSprint.mutate(
            { projectId, sprintId: sprint.id },
            { onSuccess: () => setShowConfirm(null) },
          )
        }
        title={t('sprints.completeSprint')}
        description={t('sprints.completeSprintConfirm')}
        confirmLabel={t('sprints.completeSprint')}
        isLoading={completeSprint.isPending}
      />

      <ConfirmDialog
        open={showConfirm === 'delete'}
        onClose={() => setShowConfirm(null)}
        onConfirm={() =>
          deleteSprint.mutate(
            { projectId, sprintId: sprint.id },
            { onSuccess: () => setShowConfirm(null) },
          )
        }
        title={t('sprints.deleteSprint')}
        description={t('sprints.deleteSprintConfirm')}
        confirmLabel={t('common.delete')}
        destructive
        isLoading={deleteSprint.isPending}
      />
    </div>
  )
}

export function ProjectBacklogPage() {
  const { t } = useTranslation()
  const { id: projectId } = useParams<{ id: string }>()
  const [showCreateIssue, setShowCreateIssue] = useState(false)
  const [showCreateSprint, setShowCreateSprint] = useState(false)
  const [sprintName, setSprintName] = useState('')

  const { data: project } = useProject(projectId!)
  const { data: projects } = useProjects()
  const { data: sprints, isLoading: sprintsLoading } = useSprints(projectId!)
  const { data: board } = useBoard(projectId!)
  const { data: users } = useUsers()
  const { data: issuesData, isLoading: issuesLoading } = useIssues({ projectId: projectId! })
  const createSprint = useCreateSprint()
  const createIssue = useCreateIssue()

  const selectedIssueIds = useSelectionStore((s) => s.selectedIssueIds)
  const selectAll = useSelectionStore((s) => s.selectAll)
  const clearSelection = useSelectionStore((s) => s.clearSelection)

  const allIssues = issuesData?.data || []

  const activeSprints = sprints?.filter((s) => s.status !== SprintStatus.COMPLETED) || []

  const getSprintIssues = (sprintId: string) =>
    allIssues.filter((i) => i.sprintId === sprintId)

  const backlogIssues = allIssues.filter((i) => !i.sprintId)

  const backlogIds = backlogIssues.map((i) => i.id)
  const allBacklogSelected = backlogIds.length > 0 && backlogIds.every((id) => selectedIssueIds.has(id))
  const someBacklogSelected = backlogIds.some((id) => selectedIssueIds.has(id))

  // Clear selection on unmount
  useEffect(() => {
    return () => clearSelection()
  }, [clearSelection])

  if (sprintsLoading || issuesLoading) return <LoadingPage />

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('nav.backlog')}
        breadcrumbs={[
          { label: t('nav.projects'), href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectId}/board` },
          { label: t('nav.backlog') },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowCreateSprint(true)}>
              <Plus className="h-4 w-4" />
              {t('sprints.createSprint')}
            </Button>
            <Button size="sm" onClick={() => setShowCreateIssue(true)}>
              <Plus className="h-4 w-4" />
              {t('issues.createIssue')}
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {/* Sprints */}
        {activeSprints.map((sprint) => (
          <SprintSection
            key={sprint.id}
            sprint={sprint}
            issues={getSprintIssues(sprint.id)}
            projectId={projectId!}
            statuses={board?.statuses || []}
            allSprints={activeSprints}
          />
        ))}

        {/* Backlog */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">
              {t('sprints.backlog')}{' '}
              <span className="text-gray-400 font-normal">
                ({backlogIssues.length} {backlogIssues.length !== 1 ? t('nav.issues').toLowerCase() : t('projects.issue')})
              </span>
            </h3>
          </div>
          {backlogIssues.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={allBacklogSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someBacklogSelected && !allBacklogSelected
                      }}
                      onChange={() => selectAll(backlogIds)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th colSpan={6} />
                </tr>
              </thead>
              <tbody>
                {backlogIssues.map((issue) => (
                  <IssueTableRow key={issue.id} issue={issue} selectable />
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              title={t('sprints.backlogEmpty')}
              description={t('sprints.backlogEmptyDesc')}
              action={{ label: t('issues.createIssue'), onClick: () => setShowCreateIssue(true) }}
            />
          )}
        </div>
      </div>

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        statuses={board?.statuses}
        users={users}
        projects={projects}
        sprints={activeSprints.map((s) => ({ id: s.id, name: s.name }))}
        projectId={projectId}
      />

      {/* Create Sprint Dialog */}
      <Dialog
        open={showCreateSprint}
        onClose={() => setShowCreateSprint(false)}
        className="max-w-sm"
      >
        <DialogHeader onClose={() => setShowCreateSprint(false)}>
          <DialogTitle>{t('sprints.createSprint')}</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <Input
            label={t('sprints.sprintName')}
            placeholder={`Sprint ${(sprints?.length || 0) + 1}`}
            value={sprintName}
            onChange={(e) => setSprintName(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreateSprint(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              isLoading={createSprint.isPending}
              onClick={() =>
                createSprint.mutate(
                  {
                    projectId: projectId!,
                    name: sprintName || `Sprint ${(sprints?.length || 0) + 1}`,
                  },
                  {
                    onSuccess: () => {
                      setShowCreateSprint(false)
                      setSprintName('')
                    },
                  },
                )
              }
            >
              {t('common.create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Issue Dialog */}
      <Dialog
        open={showCreateIssue}
        onClose={() => setShowCreateIssue(false)}
        className="max-w-2xl"
      >
        <DialogHeader onClose={() => setShowCreateIssue(false)}>
          <DialogTitle>{t('issues.createIssue')}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <IssueForm
            projectId={projectId!}
            statuses={board?.statuses?.map((s) => ({ id: s.id, name: s.name }))}
            sprints={activeSprints.map((s) => ({ id: s.id, name: s.name }))}
            onSubmit={(values) =>
              createIssue.mutate(
                { ...values, projectId: projectId! } as any,
                { onSuccess: () => setShowCreateIssue(false) },
              )
            }
            onCancel={() => setShowCreateIssue(false)}
            isLoading={createIssue.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
