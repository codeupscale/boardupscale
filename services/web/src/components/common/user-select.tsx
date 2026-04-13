import { useState } from 'react'
import { Check, ChevronsUpDown, Sparkles, X } from 'lucide-react'
import { useUsersDropdown, DropdownUser } from '@/hooks/useUsers'
import { useProjectMembers } from '@/hooks/useProjects'
import { useAiAssignees, useAiStatus, AssigneeSuggestion } from '@/hooks/useAi'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

interface UserSelectProps {
  value: string | null
  onChange: (userId: string | null) => void
  placeholder?: string
  className?: string
  projectId?: string
  issueType?: string
}

export function UserSelect({
  value,
  onChange,
  placeholder = 'Select user',
  className,
  projectId,
  issueType,
}: UserSelectProps) {
  const [open, setOpen] = useState(false)

  const { data: allUsers = [] } = useUsersDropdown()
  const { data: projectMembers } = useProjectMembers(projectId || '')

  const users: DropdownUser[] = projectId && projectMembers
    ? projectMembers.map((m) => ({
        id: m.user.id,
        email: m.user.email,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
      }))
    : allUsers

  const { data: aiStatus } = useAiStatus()
  const { data: aiSuggestions = [] } = useAiAssignees(projectId, issueType)
  const selectedUser = users.find((u) => u.id === value) ?? null

  const isSyntheticEmail = (email: string) => email.endsWith('@migrated.jira.local')

  const handleSelect = (userId: string | null) => {
    onChange(userId)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-left',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          {selectedUser ? (
            <>
              <Avatar user={selectedUser} size="xs" />
              <span className="flex-1 text-foreground truncate">{selectedUser.displayName}</span>
              <span
                role="button"
                aria-label="Clear selection"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(null)
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            </>
          ) : (
            <>
              <span className="flex-1 text-muted-foreground">{placeholder}</span>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search users..." />
          <CommandList>
            <CommandEmpty>No users found.</CommandEmpty>

            {/* AI Suggested Assignees */}
            {aiStatus?.enabled && aiSuggestions.length > 0 && (
              <>
                <CommandGroup
                  heading={undefined}
                >
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <Sparkles className="h-3 w-3 text-purple-500" />
                    <span className="text-xs font-medium text-purple-500">AI Suggested</span>
                  </div>
                  {aiSuggestions.map((s: AssigneeSuggestion) => {
                    const user = users.find((u) => u.id === s.userId)
                    return (
                      <CommandItem
                        key={`ai-${s.userId}`}
                        value={`ai-${s.userId}-${s.displayName}`}
                        onSelect={() => handleSelect(s.userId)}
                        className="hover:bg-purple-50 dark:hover:bg-purple-900/20"
                      >
                        <Avatar
                          user={user || { displayName: s.displayName, avatarUrl: s.avatarUrl }}
                          size="xs"
                        />
                        <div className="flex-1 min-w-0 ml-2">
                          <p className="font-medium truncate">{s.displayName}</p>
                          <p className="text-purple-500 text-[10px] truncate">{s.reason}</p>
                        </div>
                        {value === s.userId && <Check className="h-4 w-4 ml-auto" />}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            <CommandGroup>
              <CommandItem
                value="__unassigned__"
                onSelect={() => handleSelect(null)}
              >
                <span className="text-muted-foreground">Unassigned</span>
                {value === null && <Check className="h-4 w-4 ml-auto" />}
              </CommandItem>
              {users.map((user) => (
                <CommandItem
                  key={user.id}
                  value={`${user.displayName} ${user.email}`}
                  onSelect={() => handleSelect(user.id)}
                >
                  <Avatar user={user} size="xs" />
                  <div className="flex-1 min-w-0 ml-2">
                    <p className="font-medium truncate">{user.displayName}</p>
                    {isSyntheticEmail(user.email) ? (
                      <p className="text-amber-500 text-xs truncate">Migrated (no email)</p>
                    ) : (
                      <p className="text-muted-foreground text-xs truncate">{user.email}</p>
                    )}
                  </div>
                  {value === user.id && <Check className="h-4 w-4 ml-auto" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
