import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useActivities } from '@/hooks/useActivities'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { formatRelativeTime } from '@/lib/utils'
import { Activity } from '@/types'

function describeActivity(activity: Activity, t: (key: string, opts?: any) => string): string {
  switch (activity.action) {
    case 'created':
      return t('activity.createdIssue')
    case 'commented':
      return t('activity.addedComment')
    case 'work_logged':
      return t('activity.loggedWork', { minutes: activity.newValue || '0' })
    case 'updated': {
      const field = activity.field || ''
      const fieldLabel = t(`activity.fields.${field}`, { defaultValue: field })
      if (activity.oldValue && activity.newValue) {
        return t('activity.changedField', {
          field: fieldLabel,
          oldValue: activity.oldValue,
          newValue: activity.newValue,
        })
      }
      if (activity.newValue) {
        return t('activity.setField', { field: fieldLabel, value: activity.newValue })
      }
      if (activity.oldValue) {
        return t('activity.clearedField', { field: fieldLabel })
      }
      return t('activity.updatedField', { field: fieldLabel })
    }
    default:
      return activity.action
  }
}

export function ActivityList({ issueId }: { issueId: string }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useActivities(issueId, page)

  const activities = data?.data || []
  const meta = data?.meta

  if (isLoading) {
    return <p className="text-sm text-gray-500">{t('common.loading')}</p>
  }

  if (activities.length === 0) {
    return <p className="text-sm text-gray-500">{t('activity.noActivity')}</p>
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <div key={activity.id} className="flex gap-3 items-start">
          <Avatar user={activity.user} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {activity.user?.displayName || 'Unknown'}
              </span>
              <span className="text-xs text-gray-500">
                {formatRelativeTime(activity.createdAt)}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              {describeActivity(activity, t)}
            </p>
          </div>
        </div>
      ))}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t('common.previous')}
          </Button>
          <span className="text-xs text-gray-500">
            {t('common.pageOf', {
              page: meta.page,
              totalPages: meta.totalPages,
              total: meta.total,
            })}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('common.next')}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
