import { MessageSquare, Trash2, Plus } from 'lucide-react'
import { useChatStore } from '@/store/chat.store'
import { cn } from '@/lib/utils'
import type { ChatConversation } from '@/types'

interface ChatConversationListProps {
  conversations: ChatConversation[]
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNew: () => void
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ChatConversationList({
  conversations,
  onSelect,
  onDelete,
  onNew,
}: ChatConversationListProps) {
  const { activeConversationId } = useChatStore()

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Conversations
        </span>
        <button
          onClick={onNew}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          aria-label="New conversation"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {conversations.length === 0 && (
        <p className="px-3 pb-2 text-xs text-gray-400 dark:text-gray-500">No conversations yet</p>
      )}
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className={cn(
            'flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 group',
            activeConversationId === conv.id && 'bg-blue-50 dark:bg-blue-900/20',
          )}
          onClick={() => onSelect(conv.id)}
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate text-gray-700 dark:text-gray-300">{conv.title}</p>
            <p className="text-xs text-gray-400">{timeAgo(conv.lastMessageAt || conv.createdAt)}</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(conv.id)
            }}
            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500 transition-opacity"
            aria-label="Delete conversation"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
