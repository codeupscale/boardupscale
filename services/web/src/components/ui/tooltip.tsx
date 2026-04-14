import { ReactNode } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

interface TooltipProps {
  children: ReactNode
  content: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

export function Tooltip({ children, content, side = 'top', className }: TooltipProps) {
  if (!content) return <>{children}</>

  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Content
          side={side}
          className={cn(
            'z-50 overflow-hidden rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md',
            'animate-in fade-in-0 zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            className,
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-popover" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
