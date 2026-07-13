import { useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getIssueLabelColorClass } from '@/lib/issue-label-colors'
import { TicketFormField } from '../ticket-form-layout'
import { cn } from '@/lib/utils'
import { ticketModalFieldControl } from '../ticket-modal.utils'

interface TicketLabelsFieldProps {
  labels: string[]
  onAdd: (label: string) => void
  onRemove: (label: string) => void
  label?: string
  disabled?: boolean
}

export function TicketLabelsField({
  labels,
  onAdd,
  onRemove,
  label,
  disabled,
}: TicketLabelsFieldProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')

  const handleAdd = () => {
    if (!input.trim()) return
    onAdd(input)
    setInput('')
  }

  return (
    <TicketFormField label={label ?? t('issues.labels')}>
      <div
        className={cn(
          ticketModalFieldControl('flex items-center px-2.5 overflow-hidden'),
          disabled && 'opacity-50 pointer-events-none',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-hidden scrollbar-none">
          {labels.map((l) => (
            <span
              key={l}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                getIssueLabelColorClass(l),
              )}
            >
              {l}
              <button
                type="button"
                onClick={() => onRemove(l)}
                className="rounded-full hover:opacity-80"
                aria-label={`Remove label ${l}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAdd()
              }
            }}
            onBlur={handleAdd}
            placeholder={labels.length === 0 ? t('issues.addLabel') : ''}
            disabled={disabled}
            className={cn(
              'min-w-[4rem] flex-1 shrink-0 bg-transparent text-sm text-foreground outline-none',
              'placeholder:text-muted-foreground disabled:cursor-not-allowed',
            )}
          />
        </div>
      </div>
    </TicketFormField>
  )
}
