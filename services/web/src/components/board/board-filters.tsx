import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Search, X, Filter, Users, Bug, AlertTriangle, Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BoardFilters, ProjectMember, Sprint, SwimlaneGroupBy } from '@/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

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
  { value: 'task', label: 'Task', color: 'bg-primary/10 text-primary' },
  { value: 'bug', label: 'Bug', color: 'bg-red-100 text-red-700' },
]

const PRIORITIES = [
  { value: 'critical', label: 'P0 Critical', color: 'bg-red-100 text-red-700' },
  { value: 'high', label: 'P1 High', color: 'bg-orange-100 text-orange-700' },
  { value: 'medium', label: 'P2 Medium', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'low', label: 'P3 Low', color: 'bg-primary/10 text-primary' },
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

  // Debounce: auto-trigger search 400ms after the user stops typing
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const trimmed = searchValue || undefined
      if (trimmed !== (filters.search || undefined)) {
        onFiltersChange({ ...filters, search: trimmed })
      }
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // Only re-run when searchValue changes — we read filters/onFiltersChange via refs would
    // add complexity; the 400ms debounce naturally coalesces rapid changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue])

  const clearAllFilters = useCallback(() => {
    setSearchValue('')
    onFiltersChange({})
  }, [onFiltersChange])

  const setFilter = useCallback(
    (key: keyof BoardFilters, value: string | undefined) => {
      const next = { ...filters, [key]: value }
      if (!value) delete next[key]
      onFiltersChange(next)
    },
    [filters, onFiltersChange],
  )

  return (
    <div className="flex flex-wrap items-center gap-2 px-6 py-3 bg-card border-b border-border">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          type="text"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          onBlur={handleSearchBlur}
          placeholder={t('board.searchIssues', 'Search issues...')}
          className="pl-8 pr-3 py-1.5 text-sm w-48 h-auto"
        />
        {searchValue && (
          <button
            onClick={() => {
              setSearchValue('')
              onFiltersChange({ ...filters, search: undefined })
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Assignee Filter */}
      <Select value={filters.assigneeId || '__all__'} onValueChange={(v) => setFilter('assigneeId', v === '__all__' ? undefined : v)}>
        <SelectTrigger className={cn(
          'w-auto gap-1.5 text-sm',
          filters.assigneeId
            ? 'border-primary/50 bg-primary/10 text-primary'
            : 'text-muted-foreground',
        )}>
          <Users className="h-3.5 w-3.5" />
          <SelectValue placeholder={t('board.assignee', 'Assignee')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All assignees</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.userId} value={member.userId}>
              {member.user?.displayName || member.userId}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Type Filter */}
      <Select value={filters.type || '__all__'} onValueChange={(v) => setFilter('type', v === '__all__' ? undefined : v)}>
        <SelectTrigger className={cn(
          'w-auto gap-1.5 text-sm',
          filters.type
            ? 'border-primary/50 bg-primary/10 text-primary'
            : 'text-muted-foreground',
        )}>
          <Bug className="h-3.5 w-3.5" />
          <SelectValue placeholder={t('board.type', 'Type')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All types</SelectItem>
          {ISSUE_TYPES.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Priority Filter */}
      <Select value={filters.priority || '__all__'} onValueChange={(v) => setFilter('priority', v === '__all__' ? undefined : v)}>
        <SelectTrigger className={cn(
          'w-auto gap-1.5 text-sm',
          filters.priority
            ? 'border-primary/50 bg-primary/10 text-primary'
            : 'text-muted-foreground',
        )}>
          <AlertTriangle className="h-3.5 w-3.5" />
          <SelectValue placeholder={t('board.priority', 'Priority')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All priorities</SelectItem>
          {PRIORITIES.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sprint Filter */}
      {sprints && sprints.length > 0 && (
        <Select value={filters.sprintId || '__all__'} onValueChange={(v) => setFilter('sprintId', v === '__all__' ? undefined : v)}>
          <SelectTrigger className={cn(
            'w-auto gap-1.5 text-sm',
            filters.sprintId
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'text-muted-foreground',
          )}>
            <Layers className="h-3.5 w-3.5" />
            <SelectValue placeholder={t('board.sprint', 'Sprint')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All issues</SelectItem>
            <SelectItem value="backlog">Backlog (no sprint)</SelectItem>
            {sprints.map((sprint) => (
              <SelectItem key={sprint.id} value={sprint.id}>
                {sprint.name}{sprint.status === 'active' ? ' (active)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="h-5 w-px bg-border" />

      {/* Group By */}
      <Select value={groupBy} onValueChange={(v) => onGroupByChange(v as SwimlaneGroupBy)}>
        <SelectTrigger className={cn(
          'w-auto gap-1.5 text-sm',
          groupBy !== 'none'
            ? 'border-purple-300 bg-purple-50 text-purple-700'
            : 'text-muted-foreground',
        )}>
          <Filter className="h-3.5 w-3.5" />
          <SelectValue placeholder={t('board.groupBy', 'Group by')} />
        </SelectTrigger>
        <SelectContent>
          {GROUP_BY_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Active filter count + clear */}
      {activeFilterCount > 0 && (
        <>
          <div className="h-5 w-px bg-border" />
          <Badge variant="primary" className="text-xs">
            {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
          </Badge>
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        </>
      )}
    </div>
  )
}
