import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-8 text-center', className)}>
      {icon && (
        <div className="mb-4 text-muted-foreground/50 flex items-center justify-center">{icon}</div>
      )}
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>}
      {action && (
        <Button size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
