import { MessageSquare, X } from 'lucide-react'
import { useChatStore } from '@/store/chat.store'
import { useAiStatus } from '@/hooks/useAi'
import { cn } from '@/lib/utils'

export function ChatToggleButton() {
  const { data: aiStatus } = useAiStatus()
  const { isOpen, toggleChat } = useChatStore()

  if (!aiStatus?.enabled) return null

  return (
    <button
      onClick={toggleChat}
      aria-label={isOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
      aria-expanded={isOpen}
      className={cn(
        'fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105',
        'bg-blue-600 text-white hover:bg-blue-700',
        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
      )}
    >
      {isOpen ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
    </button>
  )
}
