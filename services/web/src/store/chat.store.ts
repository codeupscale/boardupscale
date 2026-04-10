import { create } from 'zustand'

interface ChatState {
  isOpen: boolean
  activeConversationId: string | null
  isStreaming: boolean
  streamingContent: string
  streamError: string | null
  panelWidth: number
  panelHeight: number
  abortController: AbortController | null
  toggleChat: () => void
  setOpen: (open: boolean) => void
  setActiveConversation: (id: string | null) => void
  setStreaming: (streaming: boolean) => void
  appendStreamChunk: (chunk: string) => void
  resetStream: () => void
  setStreamError: (error: string | null) => void
  setPanelSize: (width: number, height: number) => void
  setAbortController: (controller: AbortController | null) => void
  cancelStream: () => void
}

const getSavedSize = (key: string, fallback: number) => {
  try {
    const val = localStorage.getItem(key)
    return val ? parseInt(val, 10) : fallback
  } catch {
    return fallback
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  isOpen: false,
  activeConversationId: null,
  isStreaming: false,
  streamingContent: '',
  streamError: null,
  panelWidth: getSavedSize('chat-panel-width', 420),
  panelHeight: getSavedSize('chat-panel-height', 580),
  abortController: null,
  toggleChat: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  appendStreamChunk: (chunk) => set((s) => ({ streamingContent: s.streamingContent + chunk })),
  resetStream: () => set({ streamingContent: '', isStreaming: false, streamError: null, abortController: null }),
  setStreamError: (error) => set({ streamError: error }),
  setPanelSize: (width, height) => {
    try {
      localStorage.setItem('chat-panel-width', String(width))
      localStorage.setItem('chat-panel-height', String(height))
    } catch {
      // localStorage may be unavailable
    }
    set({ panelWidth: width, panelHeight: height })
  },
  setAbortController: (controller) => set({ abortController: controller }),
  cancelStream: () => {
    const { abortController } = get()
    if (abortController) {
      abortController.abort()
    }
    set({ isStreaming: false, abortController: null })
  },
}))
