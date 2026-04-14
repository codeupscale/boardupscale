import { useChatStore } from '@/store/chat.store'
import { useAiStatus } from '@/hooks/useAi'
import { UpsyAvatar } from './UpsyAvatar'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ChatToggleButton() {
  const { data: aiStatus } = useAiStatus()
  const { isOpen, toggleChat } = useChatStore()

  if (!aiStatus?.enabled) return null

  return (
    <button
      onClick={toggleChat}
      aria-label={isOpen ? 'Close Upsy' : 'Open Upsy'}
      aria-expanded={isOpen}
      className={cn(
        'fixed bottom-5 right-5 z-50 flex items-center justify-center rounded-full transition-all duration-300',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-background',
        isOpen
          ? 'h-11 w-11 bg-card text-foreground hover:bg-accent shadow-lg'
          : 'h-14 w-14 hover:scale-105 shadow-[0_4px_20px_-4px_rgba(99,102,241,0.5)] hover:shadow-[0_6px_28px_-4px_rgba(99,102,241,0.6)]',
      )}
    >
      {isOpen ? (
        <X className="h-5 w-5" />
      ) : (
        <div className="relative">
          <UpsyAvatar size={56} />
          {/* Online indicator */}
          <span className="absolute bottom-0 right-0 block h-3.5 w-3.5 rounded-full bg-green-400 ring-[2.5px] ring-background" />
          <span className="absolute bottom-0 right-0 block h-3.5 w-3.5 rounded-full bg-green-400 animate-ping opacity-75" />
        </div>
      )}
    </button>
  )
}
