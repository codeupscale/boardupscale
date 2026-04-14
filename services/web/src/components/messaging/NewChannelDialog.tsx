import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useOrgMembers } from '@/hooks/useOrganization'
import { useMe } from '@/hooks/useAuth'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { Check, Search } from 'lucide-react'

interface NewChannelDialogProps {
  open: boolean
  onClose: () => void
  onCreateGroup: (name: string, memberIds: string[]) => void
  onCreateDM: (userId: string) => void
}

export function NewChannelDialog({
  open,
  onClose,
  onCreateGroup,
  onCreateDM,
}: NewChannelDialogProps) {
  const [mode, setMode] = useState<'choose' | 'dm' | 'group'>('choose')
  const [groupName, setGroupName] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [search, setSearch] = useState('')

  const { data: members = [] } = useOrgMembers()
  const { data: me } = useMe()

  const otherMembers = members.filter((m) => m.id !== me?.id && m.isActive)
  const filteredMembers = otherMembers.filter(
    (m) =>
      m.displayName.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()),
  )

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    )
  }

  const handleCreateGroup = () => {
    if (!groupName.trim() || selectedUserIds.length === 0) return
    onCreateGroup(groupName.trim(), selectedUserIds)
    handleClose()
  }

  const handleSelectDM = (userId: string) => {
    onCreateDM(userId)
    handleClose()
  }

  const handleClose = () => {
    setMode('choose')
    setGroupName('')
    setSelectedUserIds([])
    setSearch('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'choose' && 'New Conversation'}
            {mode === 'dm' && 'Direct Message'}
            {mode === 'group' && 'New Group Channel'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'choose' && 'Choose how to start a conversation.'}
            {mode === 'dm' && 'Select a person to message.'}
            {mode === 'group' && 'Name the channel and add members.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'choose' && (
          <div className="flex flex-col gap-2 py-2">
            <button
              onClick={() => setMode('dm')}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-accent transition-colors text-left"
            >
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary text-lg">@</span>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">Direct Message</div>
                <div className="text-xs text-muted-foreground">Chat privately with someone</div>
              </div>
            </button>
            <button
              onClick={() => setMode('group')}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-accent transition-colors text-left"
            >
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary text-lg">#</span>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">Group Channel</div>
                <div className="text-xs text-muted-foreground">Collaborate with a team</div>
              </div>
            </button>
          </div>
        )}

        {(mode === 'dm' || mode === 'group') && (
          <div className="space-y-3">
            {mode === 'group' && (
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Channel Name
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Design Team"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                {mode === 'dm' ? 'Select a person' : 'Add members'}
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search members..."
                  className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto border border-border rounded-lg">
              {filteredMembers.length === 0 && (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  No members found
                </div>
              )}
              {filteredMembers.map((member) => {
                const isSelected = selectedUserIds.includes(member.id)
                return (
                  <button
                    key={member.id}
                    onClick={() => {
                      if (mode === 'dm') {
                        handleSelectDM(member.id)
                      } else {
                        toggleUser(member.id)
                      }
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/50',
                      isSelected && 'bg-accent',
                    )}
                  >
                    <Avatar user={member} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {member.displayName}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {member.email}
                      </div>
                    </div>
                    {mode === 'group' && isSelected && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {mode === 'group' && (
          <DialogFooter>
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || selectedUserIds.length === 0}
              className={cn(
                'px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground transition-colors',
                'hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              Create Channel
            </button>
          </DialogFooter>
        )}

        {mode !== 'choose' && (
          <button
            onClick={() => {
              setMode('choose')
              setSearch('')
              setSelectedUserIds([])
              setGroupName('')
            }}
            className="text-xs text-muted-foreground hover:text-foreground mt-1"
          >
            Back
          </button>
        )}
      </DialogContent>
    </Dialog>
  )
}
