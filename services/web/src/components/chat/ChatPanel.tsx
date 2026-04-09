import { useState, useEffect, useCallback, useRef } from 'react'
import { X, History, AlertTriangle } from 'lucide-react'
import { useChatStore } from '@/store/chat.store'
import { useAiStatus } from '@/hooks/useAi'
import { useChatConversations, useChatMessages, useCreateConversation, useDeleteConversation, useSendMessage } from '@/hooks/useChat'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'
import { ChatConversationList } from './ChatConversationList'
import { cn } from '@/lib/utils'

interface ChatPanelProps {
  projectId: string
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const { isOpen, setOpen, activeConversationId, setActiveConversation, resetStream, streamError, panelWidth, panelHeight, setPanelSize } = useChatStore()
  const [showHistory, setShowHistory] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null)

  const { data: status } = useAiStatus()
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

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: panelWidth, startH: panelHeight }

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return
      const dw = resizeRef.current.startX - e.clientX
      const dh = resizeRef.current.startY - e.clientY
      const newW = Math.max(320, Math.min(800, resizeRef.current.startW + dw))
      const newH = Math.max(400, Math.min(800, resizeRef.current.startH + dh))
      setPanelSize(newW, newH)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      resizeRef.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [panelWidth, panelHeight, setPanelSize])

  if (!isOpen) return null

  const usageTier = status?.usage?.tier
  const isExhausted = usageTier === 'exhausted'

  return (
    <div
      role="dialog"
      aria-label="AI Chat Assistant"
      className={cn(
        'fixed bottom-20 right-5 z-50 flex flex-col',
        'bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700',
        'animate-in slide-in-from-bottom-4 fade-in duration-200',
        isResizing && 'select-none',
      )}
      style={{
        width: `${panelWidth}px`,
        height: `${panelHeight}px`,
        maxHeight: '80vh',
      }}
    >
      {/* Resize handle (top-left corner) */}
      <div
        className="absolute -top-1 -left-1 w-4 h-4 cursor-nw-resize z-10"
        onMouseDown={handleResizeStart}
        aria-hidden
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <div className={cn('h-2 w-2 rounded-full', isExhausted ? 'bg-red-500' : 'bg-green-500')} />
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

      {/* Usage warning banners */}
      {usageTier === 'warning' && (
        <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-xs px-3 py-1.5 border-b border-amber-200 dark:border-amber-800 shrink-0">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{status?.usage?.percentUsed}% of daily AI budget used. Resets at midnight.</span>
        </div>
      )}
      {isExhausted && (
        <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 text-xs px-3 py-1.5 border-b border-red-200 dark:border-red-800 shrink-0">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Daily AI budget exhausted. Resets at midnight.</span>
        </div>
      )}

      {/* Stream error banner */}
      {streamError && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs px-3 py-1.5 border-b border-red-200 dark:border-red-800 shrink-0">
          {streamError}
        </div>
      )}

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
        disabled={isExhausted}
      />
    </div>
  )
}
