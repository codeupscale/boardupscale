import * as SelectPrimitive from '@radix-ui/react-select'
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
  required?: boolean
  className?: string
  disabled?: boolean
}

export function IssueTypeSelect({
  value,
  onChange,
  options,
  label,
  required,
  className,
  disabled,
}: IssueTypeSelectProps) {
  const typeOptions = options || Object.values(IssueType)

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          {label}
          {required && (
            <span className="text-destructive ml-0.5" aria-hidden="true">*</span>
          )}
        </label>
      )}
      <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled}>
        <SelectPrimitive.Trigger
          className={cn(
            'flex items-center gap-2 w-full rounded-lg border border-input',
            'bg-card text-foreground px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'hover:border-border transition-colors',
            '[&>span]:flex [&>span]:items-center [&>span]:gap-2',
          )}
        >
          <SelectPrimitive.Value>
            <IssueTypeIcon type={value as IssueType} />
            <span>{TYPE_LABELS[value] || value}</span>
          </SelectPrimitive.Value>
          <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className={cn(
              'z-[9999] rounded-lg border border-border',
              'bg-card shadow-lg py-1 max-h-60 overflow-auto',
              'w-[var(--radix-select-trigger-width)]',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
            )}
          >
            <SelectPrimitive.Viewport>
              {typeOptions.map((type) => (
                <SelectPrimitive.Item
                  key={type}
                  value={type}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer outline-none',
                    'hover:bg-accent transition-colors',
                    'data-[highlighted]:bg-accent',
                    value === type && 'bg-primary/10 text-primary',
                  )}
                >
                  <SelectPrimitive.ItemText asChild>
                    <span className="flex items-center gap-2">
                      <IssueTypeIcon type={type as IssueType} />
                      <span>{TYPE_LABELS[type] || type}</span>
                    </span>
                  </SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  )
}