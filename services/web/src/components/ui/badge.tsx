import { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { IssueStatusCategory, IssuePriority } from '@/types'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?:
    | 'default'
    | 'primary'
    | 'success'
    | 'warning'
    | 'danger'
    | 'outline'
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
    primary: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    success: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
    warning: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
    danger: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
    outline: 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
      {...props}
    >
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
