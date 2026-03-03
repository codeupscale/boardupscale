import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { useUsers } from '@/hooks/useUsers'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface UserSelectProps {
  value: string | null
  onChange: (userId: string | null) => void
  placeholder?: string
  className?: string
}

export function UserSelect({ value, onChange, placeholder = 'Select user', className }: UserSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: users = [] } = useUsers()

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

  const filtered = users.filter(
    (u) =>
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md bg-white text-left',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-gray-400 transition-colors',
        )}
      >
        {selectedUser ? (
          <>
            <Avatar user={selectedUser} size="xs" />
            <span className="flex-1 text-gray-900">{selectedUser.displayName}</span>
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
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users..."
              className="flex-1 text-sm outline-none"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
                setSearch('')
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
            >
              Unassigned
            </button>
            {filtered.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  onChange(user.id)
                  setOpen(false)
                  setSearch('')
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
              >
                <Avatar user={user} size="xs" />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 font-medium truncate">{user.displayName}</p>
                  <p className="text-gray-400 text-xs truncate">{user.email}</p>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="py-4 text-center text-sm text-gray-400">No users found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
