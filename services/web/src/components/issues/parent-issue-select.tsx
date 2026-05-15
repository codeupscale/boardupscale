import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { useIssues } from '@/hooks/useIssues'
import { IssueTypeIcon } from '@/components/issues/issue-type-icon'
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
} from '@/components/ui/command'

/**
 * Issue types that may serve as a parent, indexed by the prospective child's type.
 * Mirrors the BE hierarchy validator in issues.service.ts.
 */
const VALID_PARENT_TYPES: Record<string, string[]> = {
  story: ['epic'],
  task: ['epic'],
  bug: ['epic'],
}

export interface ParentIssueRef {
  id: string
  key: string
  title: string
  type?: string
}

interface ParentIssueSelectProps {
  value: string | null | undefined
  onChange: (parentId: string | null) => void
  projectId: string
  childType: string
  /**
   * Pre-loaded parent for display when `value` is not in the fetched candidate
   * list — typical for edit flows where the issue was loaded with its parent
   * joined but the parent isn't on the first page of candidates.
   */
  currentParent?: ParentIssueRef | null
  /**
   * Ids to omit from the candidate list — used by the issue-detail picker to
   * prevent picking the issue itself or one of its descendants as a parent.
   */
  excludeIds?: string[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * Returns whether the given child type may have a parent at all under the
 * current hierarchy rules. Use this to decide whether to render the picker.
 */
export function childTypeAllowsParent(childType: string | undefined | null): boolean {
  if (!childType) return false
  return !!VALID_PARENT_TYPES[childType.toLowerCase()]
}

export function ParentIssueSelect({
  value,
  onChange,
  projectId,
  childType,
  currentParent,
  excludeIds,
  placeholder = '— No parent —',
  disabled,
  className,
}: ParentIssueSelectProps) {
  const [open, setOpen] = useState(false)

  const validParentTypes = VALID_PARENT_TYPES[childType.toLowerCase()] ?? []

  // Under the current hierarchy every allowed child shares a single allowed
  // parent type ("epic"). If the rule ever fans out to multiple types we'd
  // need multiple queries — keep this honest by asserting length === 1.
  const fetchType = validParentTypes[0]

  const { data, isLoading } = useIssues(
    fetchType && projectId
      ? { projectId, type: fetchType, limit: 200 }
      : undefined,
  )

  const excludeSet = useMemo(() => new Set(excludeIds ?? []), [excludeIds])

  const candidates = useMemo(() => {
    const rows = data?.data ?? []
    return rows.filter(
      (p) =>
        !excludeSet.has(p.id) &&
        validParentTypes.includes(p.type.toLowerCase()),
    )
  }, [data, excludeSet, validParentTypes])

  const selected = useMemo<ParentIssueRef | null>(() => {
    if (!value) return null
    const fromList = candidates.find((p) => p.id === value)
    if (fromList) {
      return { id: fromList.id, key: fromList.key, title: fromList.title, type: fromList.type }
    }
    if (currentParent && currentParent.id === value) return currentParent
    return null
  }, [value, candidates, currentParent])

  const handleSelect = (parentId: string | null) => {
    onChange(parentId)
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onChange(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-left',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          {selected ? (
            <>
              <IssueTypeIcon type={(selected.type as any) || 'epic'} className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 text-foreground truncate">
                <span className="font-mono text-xs text-muted-foreground mr-1.5">{selected.key}</span>
                {selected.title}
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear parent"
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onChange(null)
                  }
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
      <PopoverContent
        align="start"
        className="p-0"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        <Command>
          <CommandInput placeholder="Search by key or title…" />
          <CommandList>
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
            ) : (
              <CommandEmpty>
                No eligible parents for a {childType} in this project.
              </CommandEmpty>
            )}
            <CommandGroup>
              <CommandItem value="__none__" onSelect={() => handleSelect(null)}>
                <span className="text-muted-foreground">— No parent —</span>
                {!value && <Check className="h-4 w-4 ml-auto" />}
              </CommandItem>
              {candidates.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.key} ${p.title}`}
                  onSelect={() => handleSelect(p.id)}
                >
                  <IssueTypeIcon type={p.type as any} className="h-3.5 w-3.5" />
                  <span className="font-mono text-xs text-muted-foreground ml-2">{p.key}</span>
                  <span className="flex-1 truncate ml-1.5">{p.title}</span>
                  {value === p.id && <Check className="h-4 w-4 ml-auto" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
