import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ticketModalTokens } from './ticket-modal.tokens'

interface TicketModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  className?: string
  /** When true, prevent closing via overlay/Escape (e.g. during submit) */
  preventClose?: boolean
}

export function TicketModal({
  open,
  onOpenChange,
  children,
  className,
  preventClose = false,
}: TicketModalProps) {
  const handleOpenChange = (next: boolean) => {
    if (preventClose && !next) return
    onOpenChange(next)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={ticketModalTokens.overlay} />
        <DialogPrimitive.Content
          className={cn(ticketModalTokens.content, className)}
          onPointerDownOutside={(e) => {
            if (preventClose) e.preventDefault()
          }}
          onEscapeKeyDown={(e) => {
            if (preventClose) e.preventDefault()
          }}
        >
          {children}
          <DialogPrimitive.Close
            className={ticketModalTokens.closeButton}
            disabled={preventClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function TicketModalBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(ticketModalTokens.body, className)} {...props} />
}
