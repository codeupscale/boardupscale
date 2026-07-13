import { useTranslation } from 'react-i18next'
import { IssuePriority } from '@/types'
import { ISSUE_PRIORITY_SELECT_OPTIONS } from '@/lib/issue-priority-options'
import { PriorityBadge } from '@/components/issues/priority-badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { TicketFormField } from '../ticket-form-layout'
import { ticketModalFieldControl } from '../ticket-modal.utils'

interface TicketPrioritySelectProps {
  value: IssuePriority
  onChange: (value: IssuePriority) => void
  label?: string
  disabled?: boolean
  error?: string
}

export function TicketPrioritySelect({
  value,
  onChange,
  label,
  disabled,
  error,
}: TicketPrioritySelectProps) {
  const { t } = useTranslation()

  return (
    <TicketFormField label={label ?? t('common.priority')} error={error}>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as IssuePriority)}
        disabled={disabled}
      >
        <SelectTrigger className={ticketModalFieldControl()}>
          <SelectValue>
            <PriorityBadge priority={value} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ISSUE_PRIORITY_SELECT_OPTIONS.map((priority) => (
            <SelectItem key={priority} value={priority}>
              <PriorityBadge priority={priority} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </TicketFormField>
  )
}
