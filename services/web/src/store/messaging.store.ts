import { create } from 'zustand'

interface MessagingState {
  isOpen: boolean
  activeChannelId: string | null
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setActiveChannel: (id: string | null) => void
}

export const useMessagingStore = create<MessagingState>((set) => ({
  isOpen: false,
  activeChannelId: null,
  setOpen: (open) => set({ isOpen: open }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setActiveChannel: (id) => set({ activeChannelId: id }),
}))
