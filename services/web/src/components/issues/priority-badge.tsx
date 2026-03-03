import { AlertTriangle, ArrowUp, Minus, ArrowDown, Minus as DashIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { IssuePriority } from '@/types'
import { cn } from '@/lib/utils'

interface PriorityBadgeProps {
  priority: IssuePriority
  showLabel?: boolean
  className?: string
}

const iconConfig = {
  [IssuePriority.CRITICAL]: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
  [IssuePriority.HIGH]: {
    icon: ArrowUp,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
  [IssuePriority.MEDIUM]: {
    icon: Minus,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
  },
  [IssuePriority.LOW]: {
    icon: ArrowDown,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  [IssuePriority.NONE]: {
    icon: DashIcon,
    color: 'text-gray-400',
    bg: 'bg-gray-50',
  },
}

const labelKeys: Record<IssuePriority, string> = {
  [IssuePriority.CRITICAL]: 'priorities.critical',
  [IssuePriority.HIGH]: 'priorities.high',
  [IssuePriority.MEDIUM]: 'priorities.medium',
  [IssuePriority.LOW]: 'priorities.low',
  [IssuePriority.NONE]: 'priorities.none',
}

export function PriorityBadge({ priority, showLabel = true, className }: PriorityBadgeProps) {
  const { t } = useTranslation()
  const { icon: Icon, color, bg } = iconConfig[priority] || iconConfig[IssuePriority.NONE]
  const label = t(labelKeys[priority] || 'priorities.none')

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
