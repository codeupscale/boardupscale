import { Activity, ActivityAction } from '@/types'
import { Avatar } from '@/components/ui/avatar'
import { formatRelativeTime } from '@/lib/utils'
import {
  PlusCircle,
  Edit2,
  MessageSquare,
  ArrowRight,
  UserCheck,
  Tag,
  Paperclip,
  Link as LinkIcon,
  Clock,
} from 'lucide-react'

function getActivityIcon(action: ActivityAction) {
  switch (action) {
    case 'created':
      return <PlusCircle className="h-4 w-4 text-green-500" />
    case 'updated':
      return <Edit2 className="h-4 w-4 text-blue-500" />
    case 'commented':
      return <MessageSquare className="h-4 w-4 text-purple-500" />
    case 'status_changed':
      return <ArrowRight className="h-4 w-4 text-orange-500" />
    case 'assigned':
      return <UserCheck className="h-4 w-4 text-teal-500" />
    case 'labeled':
      return <Tag className="h-4 w-4 text-pink-500" />
    case 'attachment_added':
    case 'attachment_removed':
      return <Paperclip className="h-4 w-4 text-gray-500" />
    case 'linked':
      return <LinkIcon className="h-4 w-4 text-indigo-500" />
    case 'work_logged':
      return <Clock className="h-4 w-4 text-amber-500" />
    default:
      return <Edit2 className="h-4 w-4 text-gray-400" />
  }
}

function formatActivityDescription(activity: Activity): string {
  const userName = activity.user?.displayName || 'Someone'

  switch (activity.action) {
    case 'created':
      return `${userName} created this issue`

    case 'commented':
      return `${userName} added a comment`

    case 'status_changed':
      if (activity.oldValue && activity.newValue) {
        return `${userName} changed status from '${activity.oldValue}' to '${activity.newValue}'`
      }
      return `${userName} changed the status`

    case 'assigned':
      if (activity.newValue && activity.oldValue) {
        return `${userName} changed assignee from '${activity.oldValue}' to '${activity.newValue}'`
      }
      if (activity.newValue) {
        return `${userName} assigned to ${activity.newValue}`
      }
      return `${userName} unassigned`

    case 'labeled':
      return `${userName} changed labels`

    case 'work_logged':
      return `${userName} logged ${activity.newValue || 'time'}`

    case 'attachment_added':
      return `${userName} added an attachment`

    case 'attachment_removed':
      return `${userName} removed an attachment`

    case 'linked':
      return `${userName} linked an issue`

    case 'updated':
      if (activity.field && activity.oldValue && activity.newValue) {
        return `${userName} changed ${activity.field} from '${activity.oldValue}' to '${activity.newValue}'`
      }
      if (activity.field && activity.newValue) {
        return `${userName} set ${activity.field} to '${activity.newValue}'`
      }
      if (activity.field) {
        return `${userName} updated ${activity.field}`
      }
      return `${userName} made an update`

    default:
      return `${userName} performed an action`
  }
}

interface ActivityListProps {
  activities: Activity[]
  isLoading?: boolean
}

export function ActivityList({ activities, isLoading }: ActivityListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="h-8 w-8 bg-gray-200 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-1/4" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!activities || activities.length === 0) {
    return <p className="text-sm text-gray-400">No activity yet</p>
  }

  return (
    <div className="space-y-0">
      {activities.map((activity, index) => (
        <div key={activity.id} className="flex gap-3 relative">
          {/* Timeline connector */}
          {index < activities.length - 1 && (
            <div className="absolute left-4 top-8 bottom-0 w-px bg-gray-200" />
          )}

          {/* Avatar */}
          <div className="flex-shrink-0 z-10">
            <Avatar user={activity.user} size="sm" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pb-4">
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 mt-0.5">
                {getActivityIcon(activity.action)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700">
                  {formatActivityDescription(activity)}
                </p>
                {/* Show comment preview for commented activities */}
                {activity.action === 'commented' && activity.newValue && (
                  <p className="text-sm text-gray-500 mt-1 border-l-2 border-gray-200 pl-2 truncate">
                    {activity.newValue}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatRelativeTime(activity.createdAt)}
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
