import { useAuthStore } from '@/store/auth.store'
import { useTranslation } from 'react-i18next'
import { User } from '@/types'
import { Avatar } from '@/components/ui/avatar'
import { TicketFormField } from '../ticket-form-layout'
import { ticketModalFieldControl } from '../ticket-modal.utils'

interface TicketReporterFieldProps {
  label?: string
  className?: string
  /** When set (edit mode), shows the issue reporter instead of the current user */
  reporter?: User | null
}

export function TicketReporterField({
  label,
  className,
  reporter,
}: TicketReporterFieldProps) {
  const { t } = useTranslation()
  const currentUser = useAuthStore((s) => s.user)
  const displayUser = reporter ?? currentUser

  return (
    <TicketFormField label={label ?? t('common.reporter')} className={className}>
      <div className={ticketModalFieldControl('flex items-center gap-2 px-3')}>
        {displayUser ? (
          <>
            <Avatar user={displayUser} size="xs" />
            <span className="truncate">{displayUser.displayName}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{t('common.loading')}</span>
        )}
      </div>
    </TicketFormField>
  )
}
