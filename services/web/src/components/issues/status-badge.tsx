import { useTranslation } from 'react-i18next'
import { IssueStatus, IssueStatusCategory } from '@/types'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status?: IssueStatus | null
  className?: string
}

const categoryColors: Record<IssueStatusCategory, string> = {
  [IssueStatusCategory.TODO]: 'bg-gray-100 text-gray-700',
  [IssueStatusCategory.IN_PROGRESS]: 'bg-blue-100 text-blue-700',
  [IssueStatusCategory.DONE]: 'bg-green-100 text-green-700',
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useTranslation()

  if (!status) {
    return (
      <span
        className={cn(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600',
          className,
        )}
      >
        {t('common.noStatus')}
      </span>
    )
  }

  const colorClass = categoryColors[status.category] || categoryColors[IssueStatusCategory.TODO]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
        colorClass,
        className,
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: status.color || '#6b7280' }}
      />
      {status.name}
    </span>
  )
}
