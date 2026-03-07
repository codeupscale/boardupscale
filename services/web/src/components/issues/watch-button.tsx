import { useState } from 'react'
import { Eye, EyeOff, ChevronDown, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWatchers, useToggleWatch } from '@/hooks/useWatchers'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'

interface WatchButtonProps {
  issueId: string
}

export function WatchButton({ issueId }: WatchButtonProps) {
  const { t } = useTranslation()
  const currentUser = useAuthStore((s) => s.user)
  const { data: watchers } = useWatchers(issueId)
  const toggleWatch = useToggleWatch()
  const [expanded, setExpanded] = useState(false)

  const isWatching = watchers?.some((w) => w.userId === currentUser?.id) ?? false
  const watcherCount = watchers?.length ?? 0

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        <Users className="h-3.5 w-3.5 inline mr-1" />
        {t('issues.watchers', 'Watchers')}
        {watcherCount > 0 && (
          <span className="text-gray-400 font-normal ml-1">({watcherCount})</span>
        )}
      </label>

      <div className="flex items-center gap-2 mb-2">
        <Button
          size="sm"
          variant={isWatching ? 'secondary' : 'outline'}
          className="flex-1"
          isLoading={toggleWatch.isPending}
          onClick={() => toggleWatch.mutate({ issueId })}
        >
          {isWatching ? (
            <>
              <EyeOff className="h-3.5 w-3.5" />
              {t('issues.unwatch', 'Unwatch')}
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" />
              {t('issues.watch', 'Watch')}
            </>
          )}
        </Button>

        {watcherCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>

      {/* Watcher avatars row (always visible when there are watchers) */}
      {watcherCount > 0 && !expanded && (
        <div className="flex items-center gap-1 flex-wrap">
          {watchers?.slice(0, 5).map((w) => (
            <Avatar key={w.userId} user={w.user || undefined} size="xs" />
          ))}
          {watcherCount > 5 && (
            <span className="text-xs text-gray-400">+{watcherCount - 5}</span>
          )}
        </div>
      )}

      {/* Expanded watcher list */}
      {expanded && watchers && watchers.length > 0 && (
        <div className="space-y-1.5 mt-1">
          {watchers.map((w) => (
            <div key={w.userId} className="flex items-center gap-2">
              <Avatar user={w.user || undefined} size="xs" />
              <span className="text-sm text-gray-700">
                {w.user?.displayName || 'Unknown'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
