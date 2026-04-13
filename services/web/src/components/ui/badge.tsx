import { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { IssueStatusCategory, IssuePriority } from '@/types'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-secondary-foreground',
        primary: 'bg-primary/10 text-primary',
        success: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
        warning: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
        danger: 'bg-destructive/10 text-destructive',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border border-border text-foreground bg-background',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  )
}

export function StatusCategoryBadge({ category }: { category: IssueStatusCategory }) {
  const config = {
    [IssueStatusCategory.TODO]: { label: 'To Do', variant: 'default' as const },
    [IssueStatusCategory.IN_PROGRESS]: { label: 'In Progress', variant: 'primary' as const },
    [IssueStatusCategory.DONE]: { label: 'Done', variant: 'success' as const },
  }
  const { label, variant } = config[category] || config[IssueStatusCategory.TODO]
  return <Badge variant={variant}>{label}</Badge>
}

export function PriorityBadge({ priority }: { priority: IssuePriority }) {
  const config = {
    [IssuePriority.CRITICAL]: { label: 'Critical', variant: 'danger' as const },
    [IssuePriority.HIGH]: { label: 'High', variant: 'warning' as const },
    [IssuePriority.MEDIUM]: { label: 'Medium', variant: 'warning' as const },
    [IssuePriority.LOW]: { label: 'Low', variant: 'primary' as const },
    [IssuePriority.NONE]: { label: 'None', variant: 'default' as const },
  }
  const { label, variant } = config[priority] || config[IssuePriority.NONE]
  return <Badge variant={variant}>{label}</Badge>
}
