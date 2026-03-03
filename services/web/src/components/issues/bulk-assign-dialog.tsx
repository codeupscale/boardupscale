import { useState } from 'react'
import { User } from '@/types'
import { useBulkUpdate } from '@/hooks/useBulkOperations'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
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
    <Dialog open={open} onClose={onClose} className="max-w-sm">
      <DialogHeader onClose={onClose}>
        <DialogTitle>Assign to</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-3">
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
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-gray-100 transition-colors text-left"
              onClick={() => handleSelect(user.id)}
              disabled={bulkUpdate.isPending}
            >
              <Avatar user={user} size="xs" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.displayName}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            </button>
          ))}
          {filteredUsers.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No users found</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
