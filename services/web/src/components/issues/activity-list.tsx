import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ListSkeleton } from '@/components/ui/skeleton'
import {
  ChevronDown,
  ArrowRight,
  User,
  Tag,
  Flag,
  Layers,
  Calendar,
  Clock,
  Pencil,
  GitBranch,
  BarChart3,
  Target,
  FileText,
  Type,
} from 'lucide-react'
import { useActivities } from '@/hooks/useActivities'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { formatRelativeTime } from '@/lib/utils'
import { Activity } from '@/types'
import { cn } from '@/lib/utils'

const FIELD_META: Record<string, { icon: React.ElementType; label: string; iconBg: string; iconColor: string }> = {
  statusId:     { icon: Layers,    label: 'Status',        iconBg: 'bg-primary/10',    iconColor: 'text-primary' },
  assigneeId:   { icon: User,      label: 'Assignee',      iconBg: 'bg-green-100 dark:bg-green-900/40',  iconColor: 'text-green-600 dark:text-green-400' },
  priority:     { icon: Flag,      label: 'Priority',      iconBg: 'bg-orange-100 dark:bg-orange-900/40', iconColor: 'text-orange-600 dark:text-orange-400' },
  type:         { icon: Tag,       label: 'Type',          iconBg: 'bg-purple-100 dark:bg-purple-900/40', iconColor: 'text-purple-600 dark:text-purple-400' },
  sprintId:     { icon: Target,    label: 'Sprint',        iconBg: 'bg-indigo-100 dark:bg-indigo-900/40', iconColor: 'text-indigo-600 dark:text-indigo-400' },
  title:        { icon: Type,      label: 'Title',         iconBg: 'bg-muted',        iconColor: 'text-muted-foreground' },
  description:  { icon: FileText,  label: 'Description',   iconBg: 'bg-muted',        iconColor: 'text-muted-foreground' },
  dueDate:      { icon: Calendar,  label: 'Due Date',      iconBg: 'bg-red-100 dark:bg-red-900/40',       iconColor: 'text-red-600 dark:text-red-400' },
  storyPoints:  { icon: BarChart3, label: 'Story Points',  iconBg: 'bg-violet-100 dark:bg-violet-900/40', iconColor: 'text-violet-600 dark:text-violet-400' },
  timeEstimate: { icon: Clock,     label: 'Time Estimate', iconBg: 'bg-teal-100 dark:bg-teal-900/40',     iconColor: 'text-teal-600 dark:text-teal-400' },
  labels:       { icon: Tag,       label: 'Labels',        iconBg: 'bg-yellow-100 dark:bg-yellow-900/40', iconColor: 'text-yellow-700 dark:text-yellow-400' },
  parentId:     { icon: GitBranch, label: 'Parent',        iconBg: 'bg-muted',        iconColor: 'text-muted-foreground' },
}

function formatDisplayValue(value: string | null | undefined, field?: string): string {
  if (!value || value === 'null') return 'None'
  if (field === 'description') return 'Updated'
  if (field === 'dueDate') {
    try { return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return value }
  }
  if (field === 'timeEstimate') {
    const mins = parseInt(value)
    if (!isNaN(mins)) return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
  }
  if (field === 'priority') {
    return value.charAt(0).toUpperCase() + value.slice(1)
  }
  if (field === 'type') {
    return value.charAt(0).toUpperCase() + value.slice(1)
  }
  return value
}

function ActivityEntry({ activity, isLast }: { activity: Activity; isLast: boolean }) {
  const field = activity.field || ''
  const meta = FIELD_META[field]
  const Icon = meta?.icon || Pencil
  const iconBg = meta?.iconBg || 'bg-muted'
  const iconColor = meta?.iconColor || 'text-muted-foreground'

  // For "created" action
  if (activity.action === 'created') {
    return (
      <div className="relative flex gap-3">
        {!isLast && <div className="absolute left-4 top-10 bottom-0 w-px bg-gradient-to-b from-border to-transparent" />}
        <div className={cn('relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-green-100 dark:bg-green-900/40')}>
          <Tag className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1 min-w-0 pb-6">
          <p className="text-sm text-foreground">
            <span className="font-semibold text-foreground">{activity.user?.displayName || 'System'}</span>
            {' '}created this issue
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{formatRelativeTime(activity.createdAt)}</p>
        </div>
      </div>
    )
  }

  const oldDisplay = formatDisplayValue(activity.oldValue, field)
  const newDisplay = formatDisplayValue(activity.newValue, field)
  const isDescriptionChange = field === 'description'

  return (
    <div className="relative flex gap-3">
      {/* Vertical connector */}
      {!isLast && <div className="absolute left-4 top-10 bottom-0 w-px bg-gradient-to-b from-border to-transparent" />}

      {/* Icon */}
      <div className={cn('relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center', iconBg)}>
        <Icon className={cn('h-3.5 w-3.5', iconColor)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-6">
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className="text-sm font-semibold text-foreground">
            {activity.user?.displayName || 'System'}
          </span>
          <span className="text-sm text-muted-foreground">
            changed {meta?.label || field}
          </span>
          <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
            {formatRelativeTime(activity.createdAt)}
          </span>
        </div>

        {/* Value change chips */}
        {!isDescriptionChange && (activity.oldValue || activity.newValue) && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {activity.oldValue && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted text-xs font-medium text-muted-foreground line-through decoration-gray-400/60">
                {oldDisplay}
              </span>
            )}
            <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            {activity.newValue ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 text-xs font-medium text-primary ring-1 ring-ring/20">
                {newDisplay}
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-muted text-xs text-muted-foreground italic">
                None
              </span>
            )}
          </div>
        )}

        {/* Description change — simple indicator */}
        {isDescriptionChange && (
          <div className="mt-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-900/20 text-xs font-medium text-amber-700 dark:text-amber-300 ring-1 ring-amber-200/60 dark:ring-amber-700/40">
              <FileText className="h-3 w-3" />
              Description updated
            </span>
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
    return <ListSkeleton rows={4} />
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-10">
        <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">{t('activity.noActivity')}</p>
      </div>
    )
  }

  return (
    <div>
      {activities.map((activity, idx) => (
        <ActivityEntry
          key={activity.id}
          activity={activity}
          isLast={idx === activities.length - 1}
        />
      ))}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center pt-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= meta.totalPages}
            className="text-xs text-muted-foreground"
          >
            <ChevronDown className="h-3.5 w-3.5 mr-1" />
            Show older ({meta.total - page * meta.limit > 0 ? meta.total - page * meta.limit : 0} more)
          </Button>
        </div>
      )}
    </div>
  )
}
