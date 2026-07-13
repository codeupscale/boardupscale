import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { ticketModalTokens } from './ticket-modal.tokens'

interface TicketModalHeaderProps {
  title: string
  subtitle?: string
  badge?: string
  className?: string
}

export function TicketModalHeader({
  title,
  subtitle,
  badge,
  className,
}: TicketModalHeaderProps) {
  return (
    <div className={cn(ticketModalTokens.header, className)}>
      <DialogPrimitive.Title className={ticketModalTokens.headerTitle}>
        {title}
        {badge && (
          <span className={ticketModalTokens.headerBadge}>{badge}</span>
        )}
      </DialogPrimitive.Title>
      {subtitle && (
        <DialogPrimitive.Description className={ticketModalTokens.headerSubtitle}>
          {subtitle}
        </DialogPrimitive.Description>
      )}
    </div>
  )
}
