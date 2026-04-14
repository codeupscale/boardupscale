import { useMessagingStore } from '@/store/messaging.store'
import { useUnreadCount } from '@/hooks/useMessaging'
import { MessageCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function MessagingToggleButton() {
  const { isOpen, toggleOpen } = useMessagingStore()
  const { data: unreadCount = 0 } = useUnreadCount()

  return (
    <button
      onClick={toggleOpen}
      aria-label={isOpen ? 'Close messages' : 'Open messages'}
      aria-expanded={isOpen}
      className={cn(
        'fixed bottom-5 left-5 z-50 flex items-center justify-center rounded-full transition-all duration-300',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background',
        isOpen
          ? 'h-11 w-11 bg-card text-foreground hover:bg-accent shadow-lg border border-border'
          : 'h-14 w-14 bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_4px_20px_-4px_rgba(99,102,241,0.4)] hover:shadow-[0_6px_28px_-4px_rgba(99,102,241,0.5)] hover:scale-105',
      )}
    >
      {isOpen ? (
        <X className="h-5 w-5" />
      ) : (
        <div className="relative">
          <MessageCircle className="h-6 w-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      )}
    </button>
  )
}
