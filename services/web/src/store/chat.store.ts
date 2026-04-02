import { create } from 'zustand'

interface ChatState {
  isOpen: boolean
  activeConversationId: string | null
  isStreaming: boolean
  streamingContent: string
  toggleChat: () => void
  setOpen: (open: boolean) => void
  setActiveConversation: (id: string | null) => void
  setStreaming: (streaming: boolean) => void
  appendStreamChunk: (chunk: string) => void
  resetStream: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  isOpen: false,
  activeConversationId: null,
  isStreaming: false,
  streamingContent: '',
  toggleChat: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  appendStreamChunk: (chunk) => set((s) => ({ streamingContent: s.streamingContent + chunk })),
  resetStream: () => set({ streamingContent: '', isStreaming: false }),
}))
