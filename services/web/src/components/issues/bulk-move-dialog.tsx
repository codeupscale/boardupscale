import { useState } from 'react'
import { Project } from '@/types'
import { useBulkMove } from '@/hooks/useBulkOperations'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

interface BulkMoveDialogProps {
  open: boolean
  onClose: () => void
  projects: Project[]
  currentProjectId?: string
  issueIds: string[]
}

export function BulkMoveDialog({
  open,
  onClose,
  projects,
  currentProjectId,
  issueIds,
}: BulkMoveDialogProps) {
  const [targetProjectId, setTargetProjectId] = useState('')
  const bulkMove = useBulkMove()

  const availableProjects = projects.filter((p) => p.id !== currentProjectId)

  const handleMove = () => {
    if (!targetProjectId) return
    bulkMove.mutate(
      { issueIds, targetProjectId },
      {
        onSuccess: () => {
          onClose()
          setTargetProjectId('')
        },
      },
    )
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-sm">
      <DialogHeader onClose={onClose}>
        <DialogTitle>Move Issues</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-3">
        <p className="text-sm text-gray-600">
          Move {issueIds.length} issue{issueIds.length !== 1 ? 's' : ''} to another project.
          Issues will be re-keyed and assigned the default status of the target project.
        </p>
        <Select
          label="Target Project"
          options={[
            { value: '', label: 'Select a project...' },
            ...availableProjects.map((p) => ({
              value: p.id,
              label: `${p.name} (${p.key})`,
            })),
          ]}
          value={targetProjectId}
          onChange={(e) => setTargetProjectId(e.target.value)}
        />
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleMove}
          disabled={!targetProjectId}
          isLoading={bulkMove.isPending}
        >
          Move Issues
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
