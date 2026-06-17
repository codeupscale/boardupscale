import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ProjectKeyChangeDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  oldKey: string
  newKey: string
  issueCount?: number
  isLoading?: boolean
}

export function ProjectKeyChangeDialog({
  open,
  onClose,
  onConfirm,
  oldKey,
  newKey,
  issueCount,
  isLoading,
}: ProjectKeyChangeDialogProps) {
  const [confirmText, setConfirmText] = useState('')

  const handleClose = () => {
    setConfirmText('')
    onClose()
  }

  const canConfirm = confirmText === newKey

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Change project key?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            You are changing the project key from{' '}
            <span className="font-mono font-semibold text-foreground">{oldKey}</span> to{' '}
            <span className="font-mono font-semibold text-foreground">{newKey}</span>.
          </p>
          <p className="text-foreground/90">
            This renames the key on{' '}
            <strong className="text-foreground">this same project</strong> — nothing is copied,
            duplicated, or deleted.
          </p>
          {issueCount !== undefined && issueCount > 0 && (
            <p>
              All <strong className="text-foreground">{issueCount}</strong> issue
              {issueCount === 1 ? '' : 's'} will be re-keyed (e.g.{' '}
              <span className="font-mono">{oldKey}-1</span> →{' '}
              <span className="font-mono">{newKey}-1</span>).
            </p>
          )}
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Project URLs will use the new key (e.g.{' '}
              <span className="font-mono">/projects/{newKey}/board</span>).
            </li>
            <li>
              Bookmarks with the old key (e.g.{' '}
              <span className="font-mono">/projects/{oldKey}/board</span>) still open{' '}
              <strong className="text-foreground">this project</strong>; the address bar updates to
              the new key.
            </li>
            <li>
              Issue links (<span className="font-mono">/issues/…</span>) are unchanged.
            </li>
            <li>
              Text in comments or exports that mention the old key is not updated automatically.
            </li>
          </ul>
          <div className="pt-2">
            <Input
              label={`Type ${newKey} to confirm`}
              placeholder={newKey}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} isLoading={isLoading} disabled={!canConfirm}>
            Change key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
