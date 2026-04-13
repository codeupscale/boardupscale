import { IssueStatus } from '@/types'
import { useBulkTransition } from '@/hooks/useBulkOperations'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface BulkStatusDialogProps {
  open: boolean
  onClose: () => void
  statuses: IssueStatus[]
  issueIds: string[]
}

export function BulkStatusDialog({ open, onClose, statuses, issueIds }: BulkStatusDialogProps) {
  const bulkTransition = useBulkTransition()

  const handleSelect = (statusId: string) => {
    bulkTransition.mutate(
      { issueIds, statusId },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Set Status</DialogTitle>
        </DialogHeader>
        <div className="space-y-0.5">
          {statuses.map((status) => (
            <button
              key={status.id}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-gray-100 transition-colors text-left"
              onClick={() => handleSelect(status.id)}
              disabled={bulkTransition.isPending}
            >
              <span
                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: status.color }}
              />
              <span className="text-gray-900 dark:text-gray-100">{status.name}</span>
              <span className="text-xs text-gray-500 ml-auto capitalize">
                {status.category.replace('_', ' ')}
              </span>
            </button>
          ))}
          {statuses.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No statuses available</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
