import { AlertTriangle, ArrowUp, Minus, ArrowDown, Minus as DashIcon } from 'lucide-react'
import { IssuePriority } from '@/types'
import { cn } from '@/lib/utils'

interface PriorityBadgeProps {
  priority: IssuePriority
  showLabel?: boolean
  className?: string
}

const config = {
  [IssuePriority.CRITICAL]: {
    icon: AlertTriangle,
    label: 'Critical',
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
  [IssuePriority.HIGH]: {
    icon: ArrowUp,
    label: 'High',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
  [IssuePriority.MEDIUM]: {
    icon: Minus,
    label: 'Medium',
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
  },
  [IssuePriority.LOW]: {
    icon: ArrowDown,
    label: 'Low',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  [IssuePriority.NONE]: {
    icon: DashIcon,
    label: 'None',
    color: 'text-gray-400',
    bg: 'bg-gray-50',
  },
}

export function PriorityBadge({ priority, showLabel = true, className }: PriorityBadgeProps) {
  const { icon: Icon, label, color, bg } = config[priority] || config[IssuePriority.NONE]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full text-xs font-medium',
        showLabel ? `px-2.5 py-0.5 ${bg}` : '',
        color,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {showLabel && label}
    </span>
  )
}
