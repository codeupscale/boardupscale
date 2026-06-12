import { create } from 'zustand'
import { toast as sonnerToast } from 'sonner'

export type ToastOptions = { duration?: number }

// Backward-compatible wrapper: toast('message', 'success') or toast('message', 'error')
export function toast(
  message: string,
  type: 'success' | 'error' | 'info' = 'success',
  options?: ToastOptions,
) {
  const sonnerOptions = options?.duration !== undefined ? { duration: options.duration } : undefined
  if (type === 'success') sonnerToast.success(message, sonnerOptions)
  else if (type === 'error') sonnerToast.error(message, sonnerOptions)
  else sonnerToast(message, sonnerOptions)
}

interface UiState {
  isSidebarOpen: boolean
  isSearchOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  isSidebarOpen: true,
  isSearchOpen: false,
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  setSearchOpen: (open) => set({ isSearchOpen: open }),
}))
