import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  User,
  Tag,
  Flag,
  Layers,
  Calendar,
  Clock,
  MessageSquare,
  PlusCircle,
  Pencil,
  Zap,
  GitBranch,
  BarChart3,
  Target,
  History as HistoryIcon,
} from 'lucide-react'
import { useActivities } from '@/hooks/useActivities'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { formatRelativeTime } from '@/lib/utils'
import { Activity } from '@/types'
import { cn } from '@/lib/utils'

const FIELD_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  statusId: { icon: Layers, label: 'Status', color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/30' },
  assigneeId: { icon: User, label: 'Assignee', color: 'text-green-500 bg-green-50 dark:bg-green-900/30' },
  priority: { icon: Flag, label: 'Priority', color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/30' },
  type: { icon: Tag, label: 'Type', color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/30' },
  sprintId: { icon: Target, label: 'Sprint', color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' },
  title: { icon: Pencil, label: 'Title', color: 'text-gray-500 bg-gray-50 dark:bg-gray-800' },
  description: { icon: Pencil, label: 'Description', color: 'text-gray-500 bg-gray-50 dark:bg-gray-800' },
  dueDate: { icon: Calendar, label: 'Due Date', color: 'text-red-500 bg-red-50 dark:bg-red-900/30' },
  storyPoints: { icon: BarChart3, label: 'Story Points', color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/30' },
  timeEstimate: { icon: Clock, label: 'Time Estimate', color: 'text-teal-500 bg-teal-50 dark:bg-teal-900/30' },
  labels: { icon: Tag, label: 'Labels', color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30' },
  parentId: { icon: GitBranch, label: 'Parent', color: 'text-gray-500 bg-gray-50 dark:bg-gray-800' },
}

function getActionConfig(action: string) {
  switch (action) {
    case 'created':
      return { icon: PlusCircle, color: 'text-green-500 bg-green-50 dark:bg-green-900/30' }
    case 'commented':
      return { icon: MessageSquare, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/30' }
    case 'work_logged':
      return { icon: Clock, color: 'text-teal-500 bg-teal-50 dark:bg-teal-900/30' }
    case 'updated':
      return { icon: Pencil, color: 'text-gray-500 bg-gray-50 dark:bg-gray-800' }
    default:
      return { icon: Zap, color: 'text-gray-500 bg-gray-50 dark:bg-gray-800' }
  }
}

function formatValue(value: string | null | undefined, field?: string): string {
  if (!value) return 'None'
  if (field === 'dueDate') {
    try { return new Date(value).toLocaleDateString() } catch { return value }
  }
  if (field === 'timeEstimate') {
    const mins = parseInt(value)
    if (!isNaN(mins)) return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
  }
  // Truncate UUIDs to show just the beginning
  if (value.length === 36 && value.includes('-')) return value.slice(0, 8) + '...'
  return value
}

function ActivityItem({ activity, isLast }: { activity: Activity; isLast: boolean }) {
  const { t } = useTranslation()
  const field = activity.field || ''
  const fieldCfg = FIELD_CONFIG[field]
  const actionCfg = getActionConfig(activity.action)

  const Icon = activity.action === 'updated' && fieldCfg ? fieldCfg.icon : actionCfg.icon
  const iconColor = activity.action === 'updated' && fieldCfg ? fieldCfg.color : actionCfg.color

  return (
    <div className="relative flex gap-3 group">
      {/* Timeline connector */}
      {!isLast && (
        <div className="absolute left-[15px] top-9 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
      )}

      {/* Icon */}
      <div className={cn('relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center', iconColor)}>
        <Icon className="h-3.5 w-3.5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {activity.user?.displayName || 'System'}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {activity.action === 'created' && t('activity.createdIssue')}
            {activity.action === 'commented' && t('activity.addedComment')}
            {activity.action === 'work_logged' && t('activity.loggedWork', { minutes: activity.newValue || '0' })}
            {activity.action === 'updated' && (
              <>
                updated{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {fieldCfg?.label || field}
                </span>
              </>
            )}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0">
            {formatRelativeTime(activity.createdAt)}
          </span>
        </div>

        {/* Value change detail */}
        {activity.action === 'updated' && (activity.oldValue || activity.newValue) && (
          <div className="mt-1.5 flex items-center gap-2 text-sm">
            {activity.oldValue && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-medium line-through">
                {formatValue(activity.oldValue, field)}
              </span>
            )}
            {activity.oldValue && activity.newValue && (
              <ArrowRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
            )}
            {activity.newValue && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-medium">
                {formatValue(activity.newValue, field)}
              </span>
            )}
            {!activity.newValue && activity.oldValue && (
              <>
                <ArrowRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-medium italic">
                  None
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function ActivityList({ issueId }: { issueId: string }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useActivities(issueId, page)

  const activities = data?.data || []
  const meta = data?.meta

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-blue-500" />
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8">
        <HistoryIcon className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('activity.noActivity')}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        {activities.map((activity, idx) => (
          <ActivityItem
            key={activity.id}
            activity={activity}
            isLast={idx === activities.length - 1}
          />
        ))}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
          <Button
            size="sm"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Newer
          </Button>
          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
            {meta.page} / {meta.totalPages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="text-xs"
          >
            Older
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
