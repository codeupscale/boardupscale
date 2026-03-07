import { useState, useCallback, useMemo } from 'react'
import { Search, X, Filter, Users, Bug, AlertTriangle, Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BoardFilters, ProjectMember, Sprint, SwimlaneGroupBy } from '@/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface BoardQuickFiltersProps {
  filters: BoardFilters
  onFiltersChange: (filters: BoardFilters) => void
  members: ProjectMember[]
  sprints: Sprint[]
  groupBy: SwimlaneGroupBy
  onGroupByChange: (groupBy: SwimlaneGroupBy) => void
  projectType?: string
}

const ISSUE_TYPES = [
  { value: 'epic', label: 'Epic', color: 'bg-purple-100 text-purple-700' },
  { value: 'story', label: 'Story', color: 'bg-green-100 text-green-700' },
  { value: 'task', label: 'Task', color: 'bg-blue-100 text-blue-700' },
  { value: 'bug', label: 'Bug', color: 'bg-red-100 text-red-700' },
]

const PRIORITIES = [
  { value: 'critical', label: 'P0 Critical', color: 'bg-red-100 text-red-700' },
  { value: 'high', label: 'P1 High', color: 'bg-orange-100 text-orange-700' },
  { value: 'medium', label: 'P2 Medium', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'low', label: 'P3 Low', color: 'bg-blue-100 text-blue-700' },
]

const GROUP_BY_OPTIONS: { value: SwimlaneGroupBy; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'priority', label: 'Priority' },
  { value: 'type', label: 'Type' },
  { value: 'epic', label: 'Epic' },
]

export function BoardQuickFilters({
  filters,
  onFiltersChange,
  members,
  sprints,
  groupBy,
  onGroupByChange,
  projectType,
}: BoardQuickFiltersProps) {
  const { t } = useTranslation()
  const [searchValue, setSearchValue] = useState(filters.search || '')
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.assigneeId) count++
    if (filters.type) count++
    if (filters.priority) count++
    if (filters.search) count++
    if (filters.sprintId) count++
    if (filters.label) count++
    return count
  }, [filters])

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        onFiltersChange({ ...filters, search: searchValue || undefined })
      }
    },
    [filters, onFiltersChange, searchValue],
  )

  const handleSearchBlur = useCallback(() => {
    if (searchValue !== (filters.search || '')) {
      onFiltersChange({ ...filters, search: searchValue || undefined })
    }
  }, [filters, onFiltersChange, searchValue])

  const clearAllFilters = useCallback(() => {
    setSearchValue('')
    onFiltersChange({})
  }, [onFiltersChange])

  const setFilter = useCallback(
    (key: keyof BoardFilters, value: string | undefined) => {
      const next = { ...filters, [key]: value }
      if (!value) delete next[key]
      onFiltersChange(next)
      setOpenDropdown(null)
    },
    [filters, onFiltersChange],
  )

  const toggleDropdown = useCallback((name: string) => {
    setOpenDropdown((prev) => (prev === name ? null : name))
  }, [])

  return (
    <div className="flex flex-wrap items-center gap-2 px-6 py-3 bg-white border-b border-gray-200">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          onBlur={handleSearchBlur}
          placeholder={t('board.searchIssues', 'Search issues...')}
          className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {searchValue && (
          <button
            onClick={() => {
              setSearchValue('')
              onFiltersChange({ ...filters, search: undefined })
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="h-5 w-px bg-gray-200" />

      {/* Assignee Filter */}
      <div className="relative">
        <button
          onClick={() => toggleDropdown('assignee')}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md border transition-colors',
            filters.assigneeId
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50',
          )}
        >
          <Users className="h-3.5 w-3.5" />
          {filters.assigneeId
            ? members.find((m) => m.userId === filters.assigneeId)?.user?.displayName || 'Assignee'
            : t('board.assignee', 'Assignee')}
        </button>
        {openDropdown === 'assignee' && (
          <DropdownPanel onClose={() => setOpenDropdown(null)}>
            <button
              onClick={() => setFilter('assigneeId', undefined)}
              className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-gray-100',
                !filters.assigneeId && 'bg-blue-50 text-blue-700',
              )}
            >
              All assignees
            </button>
            {members.map((member) => (
              <button
                key={member.userId}
                onClick={() => setFilter('assigneeId', member.userId)}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2',
                  filters.assigneeId === member.userId && 'bg-blue-50 text-blue-700',
                )}
              >
                <span className="h-5 w-5 rounded-full bg-gray-300 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                  {member.user?.displayName?.[0]?.toUpperCase() || '?'}
                </span>
                {member.user?.displayName || member.userId}
              </button>
            ))}
          </DropdownPanel>
        )}
      </div>

      {/* Type Filter */}
      <div className="relative">
        <button
          onClick={() => toggleDropdown('type')}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md border transition-colors',
            filters.type
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50',
          )}
        >
          <Bug className="h-3.5 w-3.5" />
          {filters.type
            ? ISSUE_TYPES.find((t) => t.value === filters.type)?.label || 'Type'
            : t('board.type', 'Type')}
        </button>
        {openDropdown === 'type' && (
          <DropdownPanel onClose={() => setOpenDropdown(null)}>
            <button
              onClick={() => setFilter('type', undefined)}
              className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-gray-100',
                !filters.type && 'bg-blue-50 text-blue-700',
              )}
            >
              All types
            </button>
            {ISSUE_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => setFilter('type', type.value)}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2',
                  filters.type === type.value && 'bg-blue-50 text-blue-700',
                )}
              >
                <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', type.color)}>
                  {type.label}
                </span>
              </button>
            ))}
          </DropdownPanel>
        )}
      </div>

      {/* Priority Filter */}
      <div className="relative">
        <button
          onClick={() => toggleDropdown('priority')}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md border transition-colors',
            filters.priority
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50',
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {filters.priority
            ? PRIORITIES.find((p) => p.value === filters.priority)?.label || 'Priority'
            : t('board.priority', 'Priority')}
        </button>
        {openDropdown === 'priority' && (
          <DropdownPanel onClose={() => setOpenDropdown(null)}>
            <button
              onClick={() => setFilter('priority', undefined)}
              className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-gray-100',
                !filters.priority && 'bg-blue-50 text-blue-700',
              )}
            >
              All priorities
            </button>
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                onClick={() => setFilter('priority', p.value)}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2',
                  filters.priority === p.value && 'bg-blue-50 text-blue-700',
                )}
              >
                <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', p.color)}>
                  {p.label}
                </span>
              </button>
            ))}
          </DropdownPanel>
        )}
      </div>

      {/* Sprint Filter */}
      {sprints && sprints.length > 0 && (
        <div className="relative">
          <button
            onClick={() => toggleDropdown('sprint')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md border transition-colors',
              filters.sprintId
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50',
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            {filters.sprintId
              ? filters.sprintId === 'backlog'
                ? 'Backlog'
                : sprints.find((s) => s.id === filters.sprintId)?.name || 'Sprint'
              : t('board.sprint', 'Sprint')}
          </button>
          {openDropdown === 'sprint' && (
            <DropdownPanel onClose={() => setOpenDropdown(null)}>
              <button
                onClick={() => setFilter('sprintId', undefined)}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-gray-100',
                  !filters.sprintId && 'bg-blue-50 text-blue-700',
                )}
              >
                All issues
              </button>
              <button
                onClick={() => setFilter('sprintId', 'backlog')}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-gray-100',
                  filters.sprintId === 'backlog' && 'bg-blue-50 text-blue-700',
                )}
              >
                Backlog (no sprint)
              </button>
              {sprints.map((sprint) => (
                <button
                  key={sprint.id}
                  onClick={() => setFilter('sprintId', sprint.id)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2',
                    filters.sprintId === sprint.id && 'bg-blue-50 text-blue-700',
                  )}
                >
                  <span>{sprint.name}</span>
                  {sprint.status === 'active' && (
                    <Badge variant="success" className="text-[10px]">Active</Badge>
                  )}
                </button>
              ))}
            </DropdownPanel>
          )}
        </div>
      )}

      <div className="h-5 w-px bg-gray-200" />

      {/* Group By */}
      <div className="relative">
        <button
          onClick={() => toggleDropdown('groupBy')}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md border transition-colors',
            groupBy !== 'none'
              ? 'border-purple-300 bg-purple-50 text-purple-700'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50',
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          {groupBy !== 'none'
            ? `Group: ${GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label}`
            : t('board.groupBy', 'Group by')}
        </button>
        {openDropdown === 'groupBy' && (
          <DropdownPanel onClose={() => setOpenDropdown(null)}>
            {GROUP_BY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onGroupByChange(option.value)
                  setOpenDropdown(null)
                }}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-gray-100',
                  groupBy === option.value && 'bg-purple-50 text-purple-700',
                )}
              >
                {option.label}
              </button>
            ))}
          </DropdownPanel>
        )}
      </div>

      {/* Active filter count + clear */}
      {activeFilterCount > 0 && (
        <>
          <div className="h-5 w-px bg-gray-200" />
          <Badge variant="primary" className="text-xs">
            {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
          </Badge>
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        </>
      )}
    </div>
  )
}

/** A simple dropdown panel that closes on outside click */
function DropdownPanel({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <>
      {/* Invisible backdrop */}
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px] max-h-64 overflow-y-auto">
        {children}
      </div>
    </>
  )
}
