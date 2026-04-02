import { useState, useEffect } from 'react'
import { X, History } from 'lucide-react'
import { useChatStore } from '@/store/chat.store'
import { useChatConversations, useChatMessages, useCreateConversation, useDeleteConversation, useSendMessage } from '@/hooks/useChat'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'
import { ChatConversationList } from './ChatConversationList'
import { cn } from '@/lib/utils'

interface ChatPanelProps {
  projectId: string
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const { isOpen, setOpen, activeConversationId, setActiveConversation, resetStream } = useChatStore()
  const [showHistory, setShowHistory] = useState(false)

  const { data: conversations = [] } = useChatConversations(projectId)
  const { data: conversationData } = useChatMessages(activeConversationId)
  const createConversation = useCreateConversation()
  const deleteConversation = useDeleteConversation()
  const { send } = useSendMessage()

  const messages = conversationData?.messages ?? []

  // Auto-select most recent conversation or create new
  useEffect(() => {
    if (!isOpen) return
    if (activeConversationId) return
    if (conversations.length > 0) {
      setActiveConversation(conversations[0].id)
    }
  }, [isOpen, conversations, activeConversationId, setActiveConversation])

  const handleNewConversation = async () => {
    const conv = await createConversation.mutateAsync(projectId)
    setActiveConversation(conv.id)
    resetStream()
    setShowHistory(false)
  }

  const handleSend = async (content: string) => {
    let convId = activeConversationId
    if (!convId) {
      const conv = await createConversation.mutateAsync(projectId)
      convId = conv.id
      setActiveConversation(conv.id)
    }
    send(convId, content)
  }

  const handleSelectConversation = (id: string) => {
    setActiveConversation(id)
    resetStream()
    setShowHistory(false)
  }

  const handleDeleteConversation = async (id: string) => {
    await deleteConversation.mutateAsync({ id, projectId })
    if (activeConversationId === id) {
      setActiveConversation(null)
      resetStream()
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-label="AI Chat Assistant"
      className={cn(
        'fixed bottom-20 right-5 z-50 flex flex-col',
        'w-[400px] h-[500px] max-h-[70vh]',
        'bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700',
        'animate-in slide-in-from-bottom-4 fade-in duration-200',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            AI Assistant
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
            aria-label="Conversation history"
          >
            <History className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Conversation list (collapsible) */}
      {showHistory && (
        <ChatConversationList
          conversations={conversations}
          onSelect={handleSelectConversation}
          onDelete={handleDeleteConversation}
          onNew={handleNewConversation}
        />
      )}

      {/* Messages */}
      <ChatMessageList messages={messages} />

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        showSuggestions={messages.length === 0}
      />
    </div>
  )
}
