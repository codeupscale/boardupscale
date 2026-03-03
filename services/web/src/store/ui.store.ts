import { create } from 'zustand'

interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

interface UiState {
  isSidebarOpen: boolean
  isSearchOpen: boolean
  toasts: Toast[]
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  isSidebarOpen: true,
  isSearchOpen: false,
  toasts: [],
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  setSearchOpen: (open) => set({ isSearchOpen: open }),
  addToast: (toast) => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function toast(message: string, type: Toast['type'] = 'success') {
  useUiStore.getState().addToast({ message, type })
}
