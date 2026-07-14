import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { TicketFormField } from '../ticket-form-layout'
import { cn } from '@/lib/utils'
import { ticketModalFieldControl } from '../ticket-modal.utils'
import type { TicketStatusOption } from '../ticket-modal.types'

interface TicketStatusSelectProps {
  value?: string
  onChange: (value: string) => void
  statuses: TicketStatusOption[]
  label?: string
  disabled?: boolean
  error?: string
}

export function TicketStatusSelect({
  value,
  onChange,
  statuses,
  label,
  disabled,
  error,
}: TicketStatusSelectProps) {
  const { t } = useTranslation()
  const selected = statuses.find((s) => s.id === value)

  return (
    <TicketFormField label={label ?? t('common.status')} error={error}>
      <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={ticketModalFieldControl()}>
          <SelectValue placeholder={t('common.status')}>
            {selected && (
              <span className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: selected.color || '#8b5cf6' }}
                />
                {selected.name}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {statuses.map((status) => (
            <SelectItem key={status.id} value={status.id}>
              <span className="flex items-center gap-2">
                <span
                  className={cn('h-2 w-2 rounded-full flex-shrink-0')}
                  style={{ backgroundColor: status.color || '#8b5cf6' }}
                />
                {status.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </TicketFormField>
  )
}
