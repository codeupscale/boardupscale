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
        'fixed bottom-5 right-5 z-50 flex items-center justify-center rounded-full shadow-xl transition-all duration-300',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
        isOpen
          ? 'h-11 w-11 bg-gray-800 dark:bg-gray-700 text-white hover:bg-gray-700 dark:hover:bg-gray-600'
          : 'h-13 w-13 hover:scale-110 hover:shadow-2xl',
      )}
    >
      {isOpen ? (
        <X className="h-5 w-5" />
      ) : (
        <div className="relative">
          <UpsyAvatar size={52} />
          {/* Online pulse */}
          <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-green-400 ring-2 ring-white dark:ring-gray-900" />
          <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-green-400 animate-ping" />
        </div>
      )}
    </button>
  )
}
