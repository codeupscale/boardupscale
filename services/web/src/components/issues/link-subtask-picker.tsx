import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useIssues } from '@/hooks/useIssues'
import { useDebounce } from '@/hooks/useDebounce'
import { IssueTypeIcon } from '@/components/issues/issue-type-icon'
import { IssueType } from '@/types'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

interface LinkSubtaskPickerProps {
  projectId: string
  /**
   * Subtask ids to omit from the candidate list — pass any subtasks already
   * attached to the current parent so they don't show up as link candidates.
   */
  excludeIds?: string[]
  /**
   * Fired with the picked subtask id. The caller is responsible for the actual
   * PATCH mutation and any toast/cache invalidation. Keeping the picker
   * stateless on the write side makes it reusable.
   */
  onPick: (subtaskId: string) => void
  /**
   * Optional callback that, when provided, renders a "Create a new subtask"
   * button inside the empty state. Lets the host modal flip to create-mode
   * when there's nothing to link to.
   */
  onSwitchToCreate?: () => void
  /**
   * Disables the picker entirely (e.g. while a link mutation is in flight).
   */
  disabled?: boolean
}

/**
 * Inline combobox that lists dangling subtasks (type='subtask' AND
 * parent_id IS NULL) in a given project, with debounced server-side
 * search. Modeled on the existing IssueLinksList search pattern, presented
 * as an inline `Command` (no Popover) so it sits flat inside a modal.
 */
export function LinkSubtaskPicker({
  projectId,
  excludeIds,
  onPick,
  onSwitchToCreate,
  disabled,
}: LinkSubtaskPickerProps) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 250)

  const { data, isLoading, isFetching } = useIssues({
    projectId,
    type: IssueType.SUBTASK,
    parentless: true,
    search: debouncedSearch || undefined,
    limit: 50,
  })

  const excludeSet = useMemo(() => new Set(excludeIds ?? []), [excludeIds])

  const candidates = useMemo(() => {
    const rows = data?.data ?? []
    return rows.filter((p) => !excludeSet.has(p.id))
  }, [data, excludeSet])

  const showLoading = isLoading || (isFetching && search !== debouncedSearch)

  return (
    // shouldFilter={false} — server-side search already filters, don't double-filter on the client
    <Command shouldFilter={false} className="rounded-md border border-border bg-card">
      <CommandInput
        placeholder="Search dangling subtasks by key or title…"
        value={search}
        onValueChange={setSearch}
        disabled={disabled}
      />
      <CommandList className="max-h-56">
        {showLoading ? (
          <div className="py-4 text-center text-sm text-muted-foreground">Searching…</div>
        ) : candidates.length === 0 ? (
          <div className="py-6 px-3 flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground text-center">
              {debouncedSearch
                ? 'No matching dangling subtasks.'
                : 'No dangling subtasks in this project.'}
            </p>
            {onSwitchToCreate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSwitchToCreate}
                disabled={disabled}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Create a new subtask
              </Button>
            )}
          </div>
        ) : (
          candidates.map((p) => (
            <CommandItem
              key={p.id}
              value={`${p.key} ${p.title}`}
              disabled={disabled}
              onSelect={() => onPick(p.id)}
              className="flex items-center gap-2"
            >
              <IssueTypeIcon type={IssueType.SUBTASK} className="h-3.5 w-3.5 shrink-0" />
              <span className="font-mono text-xs text-muted-foreground">{p.key}</span>
              <span className="flex-1 truncate">{p.title}</span>
            </CommandItem>
          ))
        )}
      </CommandList>
    </Command>
  )
}
