import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, User as UserIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { User } from '@/types'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useScrollPagination } from '@/hooks/useScrollPagination'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

const MEMBERS_PAGE_SIZE = 20

interface IssueAssigneePickerProps {
  assigneeId?: string | null
  assignee?: User | null
  members: User[]
  onAssigneeChange: (assigneeId: string | null) => void
  disabled?: boolean
  /** Board cards show assignee name on row hover */
  showNameOnHover?: boolean
  className?: string
}

export function IssueAssigneePicker({
  assigneeId,
  assignee,
  members,
  onAssigneeChange,
  disabled = false,
  showNameOnHover = false,
  className,
}: IssueAssigneePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(MEMBERS_PAGE_SIZE)
  const scrollRef = useRef<HTMLDivElement>(null)

  const selectedUser =
    assignee ?? (assigneeId ? members.find((m) => m.id === assigneeId) ?? null : null)

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        (m.email?.toLowerCase().includes(q) ?? false),
    )
  }, [members, search])

  const visibleMembers = filteredMembers.slice(0, visibleCount)
  const hasMore = visibleCount < filteredMembers.length

  const sentinelRef = useScrollPagination(
    hasMore,
    false,
    () => setVisibleCount((c) => c + MEMBERS_PAGE_SIZE),
    scrollRef,
  )

  useEffect(() => {
    if (!open) return
    setSearch('')
    setVisibleCount(MEMBERS_PAGE_SIZE)
  }, [open])

  const handleSelect = (userId: string | null) => {
    onAssigneeChange(userId)
    setOpen(false)
  }

  if (disabled) {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        {selectedUser ? (
          <>
            {showNameOnHover && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[80px] hidden group-hover:inline">
                {selectedUser.displayName}
              </span>
            )}
            <Avatar user={selectedUser} size="xs" />
          </>
        ) : (
          <div className="w-5 h-5 rounded-full border border-dashed border-border flex-shrink-0" />
        )}
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('common.assignee')}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            'flex items-center gap-1.5 rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            selectedUser ? 'hover:bg-muted/80 p-0.5' : 'p-0',
            className,
          )}
        >
          {selectedUser ? (
            <>
              {showNameOnHover && (
                <span className="text-[10px] text-muted-foreground truncate max-w-[80px] hidden group-hover:inline">
                  {selectedUser.displayName}
                </span>
              )}
              <Avatar user={selectedUser} size="xs" />
            </>
          ) : (
            <div className="w-5 h-5 rounded-full border border-dashed border-border flex-shrink-0 flex items-center justify-center hover:bg-muted/60 transition-colors">
              <UserIcon className="h-3 w-3 text-muted-foreground/70" />
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[260px] p-0"
        align="end"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="p-2 border-b border-border">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setVisibleCount(MEMBERS_PAGE_SIZE)
            }}
            placeholder={t('common.searchUsers', 'Search members...')}
            className="h-8 text-sm"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <div
          ref={scrollRef}
          className="max-h-60 overflow-y-auto p-1"
        >
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors',
              assigneeId == null && 'bg-accent/60',
            )}
          >
            <span className="text-muted-foreground flex-1 text-left">
              {t('issues.unassigned', 'Unassigned')}
            </span>
            {assigneeId == null && <Check className="h-4 w-4 shrink-0" />}
          </button>

          {visibleMembers.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground text-center">
              {t('common.noResults', 'No results found')}
            </p>
          ) : (
            visibleMembers.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => handleSelect(member.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors',
                  assigneeId === member.id && 'bg-accent/60',
                )}
              >
                <Avatar user={member} size="xs" />
                <span className="truncate flex-1 text-left">{member.displayName}</span>
                {assigneeId === member.id && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))
          )}

          {hasMore && <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />}
        </div>
      </PopoverContent>
    </Popover>
  )
}
