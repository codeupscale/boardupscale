import { create } from 'zustand'

interface NotificationsPanelState {
  isOpen: boolean
  setOpen: (open: boolean) => void
  toggleOpen: () => void
}

export const useNotificationsPanelStore = create<NotificationsPanelState>((set) => ({
  isOpen: false,
  setOpen: (open) => set({ isOpen: open }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
}))
