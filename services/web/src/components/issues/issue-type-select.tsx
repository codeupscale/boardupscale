import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { IssueType } from '@/types'
import { IssueTypeIcon } from '@/components/issues/issue-type-icon'
import { cn } from '@/lib/utils'

const TYPE_LABELS: Record<string, string> = {
  [IssueType.EPIC]: 'Epic',
  [IssueType.STORY]: 'Story',
  [IssueType.TASK]: 'Task',
  [IssueType.BUG]: 'Bug',
  [IssueType.SUBTASK]: 'Subtask',
}

interface IssueTypeSelectProps {
  value: string
  onChange: (value: string) => void
  options?: string[]
  label?: string
  className?: string
  disabled?: boolean
}

export function IssueTypeSelect({
  value,
  onChange,
  options,
  label,
  className,
  disabled,
}: IssueTypeSelectProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const typeOptions = options || Object.values(IssueType)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen(!open)
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'ArrowDown' && open) {
      e.preventDefault()
      const idx = typeOptions.indexOf(value)
      if (idx < typeOptions.length - 1) {
        onChange(typeOptions[idx + 1])
      }
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault()
      const idx = typeOptions.indexOf(value)
      if (idx > 0) {
        onChange(typeOptions[idx - 1])
      }
    }
  }

  return (
    <div className={cn('w-full', className)} ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={label || 'Select issue type'}
          disabled={disabled}
          className={cn(
            'flex items-center gap-2 w-full rounded-lg border border-gray-200 dark:border-gray-600',
            'bg-card text-foreground px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-blue-500',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'hover:border-gray-300 dark:hover:border-gray-500 transition-colors',
          )}
          onClick={() => !disabled && setOpen(!open)}
          onKeyDown={handleKeyDown}
        >
          <IssueTypeIcon type={value as IssueType} />
          <span className="flex-1 text-left">{TYPE_LABELS[value] || value}</span>
          <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', open && 'rotate-180')} />
        </button>

        {open && (
          <ul
            role="listbox"
            aria-label="Issue types"
            className={cn(
              'absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600',
              'bg-card shadow-lg py-1 max-h-60 overflow-auto',
            )}
          >
            {typeOptions.map((type) => (
              <li
                key={type}
                role="option"
                aria-selected={value === type}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer',
                  'hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                  value === type && 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
                )}
                onClick={() => {
                  onChange(type)
                  setOpen(false)
                }}
              >
                <IssueTypeIcon type={type as IssueType} />
                <span>{TYPE_LABELS[type] || type}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
