import { useTranslation } from 'react-i18next'
import { Rocket } from 'lucide-react'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { TicketFormField } from '../ticket-form-layout'
import { ticketModalFieldControl } from '../ticket-modal.utils'
import type { TicketSprintOption } from '../ticket-modal.types'

interface TicketSprintSelectProps {
  value?: string
  onChange: (value: string) => void
  sprints: TicketSprintOption[]
  label?: string
  disabled?: boolean
  error?: string
}

export function TicketSprintSelect({
  value,
  onChange,
  sprints,
  label,
  disabled,
  error,
}: TicketSprintSelectProps) {
  const { t } = useTranslation()
  const selected = sprints.find((s) => s.id === value)

  return (
    <TicketFormField label={label ?? t('issues.sprint')} error={error}>
      <Select
        value={value || ''}
        onValueChange={onChange}
        disabled={disabled || sprints.length === 0}
      >
        <SelectTrigger className={ticketModalFieldControl()}>
          <SelectValue placeholder={t('issues.selectSprint', 'Select sprint')}>
            {selected && (
              <span className="flex items-center gap-2">
                <Rocket className="h-3.5 w-3.5 text-primary" />
                {selected.name}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {sprints.map((sprint) => (
            <SelectItem key={sprint.id} value={sprint.id}>
              <span className="flex items-center gap-2">
                <Rocket className="h-3.5 w-3.5 text-primary" />
                {sprint.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </TicketFormField>
  )
}
