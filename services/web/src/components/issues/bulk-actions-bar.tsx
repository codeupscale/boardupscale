import { useState } from 'react'
import {
  X,
  UserPlus,
  ArrowRightLeft,
  Signal,
  Trash2,
  FolderInput,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSelectionStore } from '@/store/selection.store'
import { useBulkUpdate, useBulkDelete } from '@/hooks/useBulkOperations'
import { BulkAssignDialog } from './bulk-assign-dialog'
import { BulkStatusDialog } from './bulk-status-dialog'
import { BulkMoveDialog } from './bulk-move-dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { IssueStatus, User, Project, IssuePriority } from '@/types'

interface BulkActionsBarProps {
  statuses?: IssueStatus[]
  users?: User[]
  projects?: Project[]
  sprints?: { id: string; name: string }[]
  projectId?: string
}

export function BulkActionsBar({
  statuses,
  users,
  projects,
  sprints,
  projectId,
}: BulkActionsBarProps) {
  const selectedIssueIds = useSelectionStore((s) => s.selectedIssueIds)
  const clearSelection = useSelectionStore((s) => s.clearSelection)
  const count = selectedIssueIds.size

  const [showAssign, setShowAssign] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [showMove, setShowMove] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showPriority, setShowPriority] = useState(false)
  const [showSprint, setShowSprint] = useState(false)

  const bulkUpdate = useBulkUpdate()
  const bulkDelete = useBulkDelete()

  if (count === 0) return null

  const issueIds = Array.from(selectedIssueIds)

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-4">
        <span className="text-sm font-medium whitespace-nowrap">
          {count} issue{count !== 1 ? 's' : ''} selected
        </span>

        <div className="h-5 w-px bg-gray-700" />

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="text-gray-300 hover:text-white hover:bg-gray-800"
            onClick={() => setShowAssign(true)}
          >
            <UserPlus className="h-4 w-4" />
            Assign
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="text-gray-300 hover:text-white hover:bg-gray-800"
            onClick={() => setShowStatus(true)}
          >
            <Signal className="h-4 w-4" />
            Status
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="text-gray-300 hover:text-white hover:bg-gray-800"
            onClick={() => setShowPriority(true)}
          >
            <Zap className="h-4 w-4" />
            Priority
          </Button>

          {sprints && sprints.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-gray-300 hover:text-white hover:bg-gray-800"
              onClick={() => setShowSprint(true)}
            >
              <ArrowRightLeft className="h-4 w-4" />
              Sprint
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="text-gray-300 hover:text-white hover:bg-gray-800"
            onClick={() => setShowMove(true)}
          >
            <FolderInput className="h-4 w-4" />
            Move
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="text-red-400 hover:text-red-300 hover:bg-gray-800"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>

        <div className="h-5 w-px bg-gray-700" />

        <button
          onClick={clearSelection}
          className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Assign Dialog */}
      <BulkAssignDialog
        open={showAssign}
        onClose={() => setShowAssign(false)}
        users={users || []}
        issueIds={issueIds}
      />

      {/* Status Dialog */}
      <BulkStatusDialog
        open={showStatus}
        onClose={() => setShowStatus(false)}
        statuses={statuses || []}
        issueIds={issueIds}
      />

      {/* Priority Dialog */}
      {showPriority && (
        <PriorityPickerDialog
          open={showPriority}
          onClose={() => setShowPriority(false)}
          issueIds={issueIds}
        />
      )}

      {/* Sprint Dialog */}
      {showSprint && (
        <SprintPickerDialog
          open={showSprint}
          onClose={() => setShowSprint(false)}
          sprints={sprints || []}
          issueIds={issueIds}
        />
      )}

      {/* Move Dialog */}
      <BulkMoveDialog
        open={showMove}
        onClose={() => setShowMove(false)}
        projects={projects || []}
        currentProjectId={projectId}
        issueIds={issueIds}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={() =>
          bulkDelete.mutate(
            { issueIds },
            { onSuccess: () => setShowDelete(false) },
          )
        }
        title="Delete Issues"
        description={`Are you sure you want to delete ${count} issue${count !== 1 ? 's' : ''}? They can be restored from Trash within 30 days.`}
        confirmLabel="Delete"
        destructive
        isLoading={bulkDelete.isPending}
      />
    </>
  )
}

function PriorityPickerDialog({
  open,
  onClose,
  issueIds,
}: {
  open: boolean
  onClose: () => void
  issueIds: string[]
}) {
  const bulkUpdate = useBulkUpdate()

  const priorities = [
    { value: IssuePriority.CRITICAL, label: 'Critical', color: 'bg-red-500' },
    { value: IssuePriority.HIGH, label: 'High', color: 'bg-orange-500' },
    { value: IssuePriority.MEDIUM, label: 'Medium', color: 'bg-yellow-500' },
    { value: IssuePriority.LOW, label: 'Low', color: 'bg-blue-500' },
  ]

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-xs mx-4">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Set Priority</h3>
        </div>
        <div className="p-2">
          {priorities.map((p) => (
            <button
              key={p.value}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-gray-100 transition-colors text-left"
              onClick={() =>
                bulkUpdate.mutate(
                  { issueIds, priority: p.value },
                  { onSuccess: onClose },
                )
              }
              disabled={bulkUpdate.isPending}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${p.color}`} />
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function SprintPickerDialog({
  open,
  onClose,
  sprints,
  issueIds,
}: {
  open: boolean
  onClose: () => void
  sprints: { id: string; name: string }[]
  issueIds: string[]
}) {
  const bulkUpdate = useBulkUpdate()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-xs mx-4">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Move to Sprint</h3>
        </div>
        <div className="p-2 max-h-64 overflow-y-auto">
          {sprints.map((sprint) => (
            <button
              key={sprint.id}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-gray-100 transition-colors text-left"
              onClick={() =>
                bulkUpdate.mutate(
                  { issueIds, sprintId: sprint.id },
                  { onSuccess: onClose },
                )
              }
              disabled={bulkUpdate.isPending}
            >
              {sprint.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
