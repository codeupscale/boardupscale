import * as React from 'react'
import { cn } from '@/lib/utils'
import { ticketModalTokens } from './ticket-modal.tokens'

interface TicketFormFieldProps {
  label?: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
  className?: string
  htmlFor?: string
}

export function TicketFormField({
  label,
  required,
  error,
  hint,
  children,
  className,
  htmlFor,
}: TicketFormFieldProps) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={htmlFor} className={ticketModalTokens.fieldLabel}>
          {label}
          {required && (
            <span className="text-destructive ml-0.5" aria-hidden="true">*</span>
          )}
        </label>
      )}
      {children}
      {error && <p className={ticketModalTokens.fieldError}>{error}</p>}
      {hint && !error && (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

interface TicketFormRowProps {
  children: React.ReactNode
  className?: string
}

export function TicketFormRow({ children, className }: TicketFormRowProps) {
  return (
    <div className={cn(ticketModalTokens.formRow, className)}>
      {children}
    </div>
  )
}

export function TicketFormSection({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn(ticketModalTokens.formSection, className)}>
      {children}
    </div>
  )
}
