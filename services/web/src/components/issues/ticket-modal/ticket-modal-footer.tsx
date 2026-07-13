import * as React from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ticketModalTokens } from './ticket-modal.tokens'

interface TicketModalFooterProps {
  onCancel: () => void
  onSubmit: () => void
  submitLabel?: string
  isLoading?: boolean
  submitDisabled?: boolean
  showCreateIcon?: boolean
  className?: string
}

export function TicketModalFooter({
  onCancel,
  onSubmit,
  submitLabel,
  isLoading = false,
  submitDisabled = false,
  showCreateIcon = false,
  className,
}: TicketModalFooterProps) {
  const { t } = useTranslation()

  return (
    <div className={cn(ticketModalTokens.footer, className)}>
      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={isLoading}
      >
        {t('common.cancel')}
      </Button>
      <Button
        type="button"
        onClick={onSubmit}
        isLoading={isLoading}
        disabled={submitDisabled || isLoading}
      >
        {showCreateIcon && <Plus className="h-4 w-4" />}
        {submitLabel ?? t('issues.createIssue')}
      </Button>
    </div>
  )
}
