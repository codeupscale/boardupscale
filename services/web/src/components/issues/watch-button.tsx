import { useState } from 'react'
import { Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWatchers, useToggleWatch } from '@/hooks/useWatchers'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'

export function WatchButton({ issueId }: { issueId: string }) {
  const { t } = useTranslation()
  const currentUser = useAuthStore((s) => s.user)
  const { data: watchersData } = useWatchers(issueId)
  const toggleWatch = useToggleWatch()
  const [showWatchers, setShowWatchers] = useState(false)

  const isWatching = watchersData?.watchers?.some(
    (w) => w.userId === currentUser?.id,
  )
  const watcherCount = watchersData?.count || 0

  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        {t('issues.watchers', 'Watchers')}
      </label>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={isWatching ? 'default' : 'outline'}
          className="flex-1"
          isLoading={toggleWatch.isPending}
          onClick={() => toggleWatch.mutate({ issueId })}
        >
          {isWatching ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
          {isWatching
            ? t('issues.watching', 'Watching')
            : t('issues.watch', 'Watch')}
        </Button>
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground/80"
          onClick={() => setShowWatchers(!showWatchers)}
        >
          <span>{watcherCount}</span>
          {showWatchers ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {showWatchers && watchersData && watchersData.watchers.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {watchersData.watchers.map((w) => (
            <div key={w.userId} className="flex items-center gap-2">
              <Avatar
                user={{ displayName: w.displayName, avatarUrl: w.avatarUrl } as any}
                size="xs"
              />
              <span className="text-xs text-muted-foreground truncate">{w.displayName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
