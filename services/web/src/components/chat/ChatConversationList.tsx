import { useState } from 'react'
import { MessageSquare, Trash2, Plus, Search } from 'lucide-react'
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
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  return `${Math.floor(days / 30)}mo`
}

export function ChatConversationList({
  conversations,
  onSelect,
  onDelete,
  onNew,
}: ChatConversationListProps) {
  const { activeConversationId } = useChatStore()
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = searchQuery.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : conversations

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 max-h-56 overflow-y-auto shrink-0 bg-gray-50/50 dark:bg-gray-900/50">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          History
        </span>
        <button
          onClick={onNew}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
          aria-label="New conversation"
        >
          <Plus className="h-3 w-3" />
          New
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="px-3 pb-3 text-[10px] text-gray-400 dark:text-gray-500 text-center">
          {searchQuery ? 'No matches found' : 'No conversations yet'}
        </p>
      )}
      <div className="px-2 pb-2 space-y-0.5">
        {filtered.map((conv) => (
          <div
            key={conv.id}
            className={cn(
              'flex items-center gap-2 px-2.5 py-2 cursor-pointer rounded-lg group transition-all duration-100',
              activeConversationId === conv.id
                ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200/50 dark:border-indigo-800/50'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800/50 border border-transparent',
            )}
            onClick={() => onSelect(conv.id)}
          >
            <MessageSquare className={cn(
              'h-3.5 w-3.5 shrink-0',
              activeConversationId === conv.id ? 'text-indigo-500' : 'text-gray-400',
            )} />
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate text-gray-700 dark:text-gray-300 font-medium">{conv.title}</p>
            </div>
            <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">
              {timeAgo(conv.lastMessageAt || conv.createdAt)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(conv.id)
              }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-all"
              aria-label="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
