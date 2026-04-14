import { useState } from 'react'
import { User } from '@/types'
import { useBulkUpdate } from '@/hooks/useBulkOperations'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'

interface BulkAssignDialogProps {
  open: boolean
  onClose: () => void
  users: User[]
  issueIds: string[]
}

export function BulkAssignDialog({ open, onClose, users, issueIds }: BulkAssignDialogProps) {
  const [search, setSearch] = useState('')
  const bulkUpdate = useBulkUpdate()

  const filteredUsers = users.filter(
    (u) =>
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  )

  const handleSelect = (userId: string) => {
    bulkUpdate.mutate(
      { issueIds, assigneeId: userId },
      { onSuccess: () => { onClose(); setSearch('') } },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign to</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {filteredUsers.map((user) => (
              <button
                key={user.id}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors text-left"
                onClick={() => handleSelect(user.id)}
                disabled={bulkUpdate.isPending}
              >
                <Avatar user={user} size="xs" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{user.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
              </button>
            ))}
            {filteredUsers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
