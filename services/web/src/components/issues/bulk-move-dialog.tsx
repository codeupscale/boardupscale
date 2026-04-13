import { useState } from 'react'
import { Project } from '@/types'
import { useBulkMove } from '@/hooks/useBulkOperations'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
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
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move Issues</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Move {issueIds.length} issue{issueIds.length !== 1 ? 's' : ''} to another project.
            Issues will be re-keyed and assigned the default status of the target project.
          </p>
          <div className="w-full">
            <Label className="mb-1">Target Project</Label>
            <Select value={targetProjectId || '__none__'} onValueChange={(v) => setTargetProjectId(v === '__none__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project..." />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.key})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
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
      </DialogContent>
    </Dialog>
  )
}
