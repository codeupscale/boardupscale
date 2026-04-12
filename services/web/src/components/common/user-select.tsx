import { useState, useRef, useEffect } from 'react'
import { Search, X, Sparkles } from 'lucide-react'
import { useUsersDropdown, DropdownUser } from '@/hooks/useUsers'
import { useProjectMembers } from '@/hooks/useProjects'
import { useAiAssignees, useAiStatus, AssigneeSuggestion } from '@/hooks/useAi'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface UserSelectProps {
  value: string | null
  onChange: (userId: string | null) => void
  placeholder?: string
  className?: string
  projectId?: string
  issueType?: string
}

export function UserSelect({ value, onChange, placeholder = 'Select user', className, projectId, issueType }: UserSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // When projectId is supplied, scope the list to project members only
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

  const selectedUser = users.find((u) => u.id === value) || null

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const isSyntheticEmail = (email: string) => email.endsWith('@migrated.jira.local')

  const filtered = users.filter(
    (u) =>
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      (!isSyntheticEmail(u.email) && u.email.toLowerCase().includes(search.toLowerCase())),
  )

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-left',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-gray-400 dark:hover:border-gray-500 transition-colors',
        )}
      >
        {selectedUser ? (
          <>
            <Avatar user={selectedUser} size="xs" />
            <span className="flex-1 text-gray-900 dark:text-gray-100">{selectedUser.displayName}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <span className="text-gray-400 flex-1">{placeholder}</span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-black/40 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users..."
              className="flex-1 text-sm outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
                setSearch('')
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Unassigned
            </button>

            {/* AI Suggested Assignees */}
            {aiStatus?.enabled && aiSuggestions.length > 0 && !search && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-100 dark:border-gray-700">
                  <Sparkles className="h-3 w-3 text-purple-500" />
                  <span className="text-[10px] uppercase tracking-wider text-purple-500 font-semibold">AI Suggested</span>
                </div>
                {aiSuggestions.map((s: AssigneeSuggestion) => {
                  const user = users.find((u) => u.id === s.userId)
                  return (
                    <button
                      key={`ai-${s.userId}`}
                      type="button"
                      onClick={() => {
                        onChange(s.userId)
                        setOpen(false)
                        setSearch('')
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-purple-50 dark:hover:bg-purple-900/20 text-left"
                    >
                      <Avatar user={user || { displayName: s.displayName, avatarUrl: s.avatarUrl }} size="xs" />
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 dark:text-gray-100 font-medium truncate">{s.displayName}</p>
                        <p className="text-purple-500 text-[10px] truncate">{s.reason}</p>
                      </div>
                    </button>
                  )
                })}
                <div className="border-b border-gray-100 dark:border-gray-700 my-0.5" />
              </>
            )}

            {filtered.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  onChange(user.id)
                  setOpen(false)
                  setSearch('')
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-left"
              >
                <Avatar user={user} size="xs" />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 dark:text-gray-100 font-medium truncate">{user.displayName}</p>
                  {isSyntheticEmail(user.email) ? (
                    <p className="text-amber-500 text-xs truncate">Migrated (no email)</p>
                  ) : (
                    <p className="text-gray-500 text-xs truncate">{user.email}</p>
                  )}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="py-4 text-center text-sm text-gray-500">No users found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
