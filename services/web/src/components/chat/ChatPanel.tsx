import { useState, useEffect, useCallback, useRef } from 'react'
import { X, History, AlertTriangle, RotateCcw } from 'lucide-react'
import { useChatStore } from '@/store/chat.store'
import { useAiStatus } from '@/hooks/useAi'
import { useMe } from '@/hooks/useAuth'
import { useChatConversations, useChatMessages, useCreateConversation, useDeleteConversation, useSendMessage } from '@/hooks/useChat'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'
import { ChatConversationList } from './ChatConversationList'
import { UpsyAvatarSmall } from './UpsyAvatar'
import { cn } from '@/lib/utils'

interface ChatPanelProps {
  projectId: string
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const {
    isOpen, setOpen, activeConversationId, setActiveConversation,
    resetStream, streamError, panelWidth, panelHeight, setPanelSize,
  } = useChatStore()
  const [showHistory, setShowHistory] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null)

  const { data: me } = useMe()
  const { data: status } = useAiStatus()
  const { data: conversations = [] } = useChatConversations(projectId)
  const { data: conversationData } = useChatMessages(activeConversationId)
  const createConversation = useCreateConversation()
  const deleteConversation = useDeleteConversation()
  const { send } = useSendMessage()

  const messages = conversationData?.messages ?? []

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
      const newW = Math.max(360, Math.min(800, resizeRef.current.startW + dw))
      const newH = Math.max(450, Math.min(850, resizeRef.current.startH + dh))
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
      aria-label="Upsy AI Assistant"
      className={cn(
        'fixed bottom-20 right-5 z-50 flex flex-col',
        'bg-white dark:bg-gray-900 rounded-2xl shadow-2xl',
        'border border-gray-200/80 dark:border-gray-700/80',
        'animate-in slide-in-from-bottom-4 fade-in duration-300',
        isResizing && 'select-none',
      )}
      style={{
        width: `${panelWidth}px`,
        height: `${panelHeight}px`,
        maxHeight: '85vh',
      }}
    >
      {/* Resize handle */}
      <div
        className="absolute -top-1.5 -left-1.5 w-5 h-5 cursor-nw-resize z-10 group"
        onMouseDown={handleResizeStart}
        aria-hidden
      >
        <div className="w-2.5 h-2.5 mt-1 ml-1 rounded-sm border border-gray-300 dark:border-gray-600 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20 rounded-t-2xl">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <UpsyAvatarSmall />
            <span className="absolute -bottom-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full bg-green-400 border-2 border-white dark:border-gray-900" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-none">
              Upsy
            </h3>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              {status?.provider ? `${status.provider} · ` : ''}Project Assistant
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleNewConversation}
            className="p-1.5 rounded-lg hover:bg-white/80 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="New conversation"
            title="New conversation"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              showHistory
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                : 'hover:bg-white/80 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
            )}
            aria-label="Conversation history"
            title="History"
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg hover:bg-white/80 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Usage warning banners */}
      {usageTier === 'warning' && (
        <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 text-[11px] px-4 py-1.5 border-b border-amber-100 dark:border-amber-900/30 shrink-0">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{status?.usage?.percentUsed}% of daily AI budget used</span>
        </div>
      )}
      {isExhausted && (
        <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400 text-[11px] px-4 py-1.5 border-b border-red-100 dark:border-red-900/30 shrink-0">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Daily AI budget exhausted. Resets at midnight.</span>
        </div>
      )}

      {/* Stream error */}
      {streamError && (
        <div className="bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 text-[11px] px-4 py-1.5 border-b border-red-100 dark:border-red-900/30 shrink-0">
          {streamError}
        </div>
      )}

      {/* Conversation list */}
      {showHistory && (
        <ChatConversationList
          conversations={conversations}
          onSelect={handleSelectConversation}
          onDelete={handleDeleteConversation}
          onNew={handleNewConversation}
        />
      )}

      {/* Messages */}
      <ChatMessageList
        messages={messages}
        userName={me?.displayName}
        userAvatar={me?.avatarUrl}
      />

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        showSuggestions={messages.length === 0}
        disabled={isExhausted}
      />
    </div>
  )
}
