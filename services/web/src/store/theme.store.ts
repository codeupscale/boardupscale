import { create } from 'zustand'

type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  resolved: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolve(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? getSystemPreference() : theme
}

function applyTheme(resolved: 'light' | 'dark', animate = false) {
  const root = document.documentElement
  if (animate) {
    root.classList.add('theme-transition')
    setTimeout(() => root.classList.remove('theme-transition'), 300)
  }
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

// Read persisted value
const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null) as Theme | null
const initial: Theme = stored || 'system'
const initialResolved = resolve(initial)

// Apply immediately to prevent flash
applyTheme(initialResolved)

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initial,
  resolved: initialResolved,
  setTheme: (theme) => {
    const resolved = resolve(theme)
    localStorage.setItem('theme', theme)
    applyTheme(resolved, true)
    set({ theme, resolved })
  },
}))

// Listen for system preference changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const state = useThemeStore.getState()
    if (state.theme === 'system') {
      const resolved = getSystemPreference()
      applyTheme(resolved)
      useThemeStore.setState({ resolved })
    }
  })
}
