import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
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
  onDelete?: () => void
  showDelete?: boolean
  deleteDisabled?: boolean
  isDeleting?: boolean
  className?: string
}

export function TicketModalFooter({
  onCancel,
  onSubmit,
  submitLabel,
  isLoading = false,
  submitDisabled = false,
  showCreateIcon = false,
  onDelete,
  showDelete = false,
  deleteDisabled = false,
  isDeleting = false,
  className,
}: TicketModalFooterProps) {
  const { t } = useTranslation()
  const footerBusy = isLoading || isDeleting

  return (
    <div
      className={cn(
        ticketModalTokens.footer,
        showDelete ? 'justify-between' : undefined,
        className,
      )}
    >
      {showDelete && (
        <Button
          type="button"
          variant="ghost"
          onClick={onDelete}
          disabled={deleteDisabled || footerBusy}
          isLoading={isDeleting}
          aria-label={t('issues.deleteIssue')}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          {!isDeleting && <Trash2 className="h-4 w-4" />}
          {t('issues.deleteIssue')}
        </Button>
      )}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={footerBusy}
        >
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          onClick={onSubmit}
          isLoading={isLoading}
          disabled={submitDisabled || footerBusy}
        >
          {showCreateIcon && <Plus className="h-4 w-4" />}
          {submitLabel ?? t('issues.createIssue')}
        </Button>
      </div>
    </div>
  )
}
