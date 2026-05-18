import { create } from 'zustand'

type Theme = 'light' | 'dark' | 'system'

export type ColorTheme =
  | 'electric-cyan'
  | 'molten-ember'
  | 'arctic-sapphire'
  | 'neon-rose'
  | 'jade-dragon'
  | 'midnight-cobalt'
  | 'obsidian-graphite'
  | 'solar-gold'

export const COLOR_THEMES: { id: ColorTheme; name: string; description: string; preview: { primary: string; secondary: string; accent: string } }[] = [
  {
    id: 'electric-cyan',
    name: 'Electric Cyan',
    description: 'Cyberpunk energy — Razer meets Linear',
    preview: { primary: '#00897b', secondary: '#00bfa5', accent: '#64ffda' },
  },
  {
    id: 'molten-ember',
    name: 'Molten Ember',
    description: 'Volcanic warmth — Valorant vibes',
    preview: { primary: '#c2410c', secondary: '#ea580c', accent: '#ffab76' },
  },
  {
    id: 'arctic-sapphire',
    name: 'Arctic Sapphire',
    description: 'Ice-cold precision — fighter jet HUD',
    preview: { primary: '#1565c0', secondary: '#2196f3', accent: '#a3e635' },
  },
  {
    id: 'neon-rose',
    name: 'Neon Rose',
    description: 'Bold rose-red — ROG Dragon energy',
    preview: { primary: '#9f1239', secondary: '#e11d48', accent: '#d4a017' },
  },
  {
    id: 'jade-dragon',
    name: 'Jade Dragon',
    description: 'Luxury gaming meets nature',
    preview: { primary: '#065f46', secondary: '#059669', accent: '#34d399' },
  },
  {
    id: 'midnight-cobalt',
    name: 'Midnight Cobalt',
    description: 'PlayStation energy — deep cobalt',
    preview: { primary: '#1e3a8a', secondary: '#1d4ed8', accent: '#60a5fa' },
  },
  {
    id: 'obsidian-graphite',
    name: 'Obsidian Graphite',
    description: 'Monochrome power — Porsche interior',
    preview: { primary: '#292524', secondary: '#44403c', accent: '#78716c' },
  },
  {
    id: 'solar-gold',
    name: 'Solar Gold',
    description: 'Championship trophy — esports premium',
    preview: { primary: '#78350f', secondary: '#b45309', accent: '#f59e0b' },
  },
]

interface ThemeState {
  theme: Theme
  resolved: 'light' | 'dark'
  colorTheme: ColorTheme
  /**
   * True while a theme swap is in progress. Subscribed to by
   * <ThemeTransitionOverlay /> so it can blur the screen and hide the
   * brief staggered animation that happens as transitions run at slightly
   * different speeds across icons, shadows, gradients, etc.
   */
  changing: boolean
  setTheme: (theme: Theme) => void
  setColorTheme: (colorTheme: ColorTheme) => void
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

function applyColorTheme(colorTheme: ColorTheme) {
  document.documentElement.setAttribute('data-color-theme', colorTheme)
}

// Read persisted values
const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null) as Theme | null
const storedColor = (typeof localStorage !== 'undefined' ? localStorage.getItem('color-theme') : null) as ColorTheme | null
const initial: Theme = stored || 'system'
const initialResolved = resolve(initial)
const initialColor: ColorTheme = storedColor || 'electric-cyan'

// Apply immediately to prevent flash
applyTheme(initialResolved)
applyColorTheme(initialColor)

/**
 * Total time the overlay stays visible after the theme class is applied, in
 * ms. Long enough that the underlying CSS transitions (200ms on background /
 * border / color) settle completely AND the loading screen registers as a
 * deliberate, branded moment instead of a flash. Below ~400ms the overlay
 * feels accidental; above ~700ms it feels slow. 500ms is the sweet spot.
 */
const THEME_TRANSITION_HOLD_MS = 500

// Module-scoped timer so rapid re-clicks extend (not stack) the overlay window.
let pendingHideTimer: ReturnType<typeof setTimeout> | null = null

function beginTransition(set: (partial: Partial<ThemeState>) => void, apply: () => void) {
  // 1. Surface the overlay first. Zustand → React render → paint.
  set({ changing: true })

  // 2. Wait two animation frames so the overlay is fully on screen
  //    BEFORE we flip the theme class. A single rAF is unreliable on
  //    slower devices; the second guarantees a committed paint.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      apply()

      // 3. Reset any in-flight hide so rapid clicks extend the window
      //    instead of clipping it short.
      if (pendingHideTimer !== null) {
        clearTimeout(pendingHideTimer)
      }
      pendingHideTimer = setTimeout(() => {
        pendingHideTimer = null
        set({ changing: false })
      }, THEME_TRANSITION_HOLD_MS)
    })
  })
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initial,
  resolved: initialResolved,
  colorTheme: initialColor,
  changing: false,
  setTheme: (theme) => {
    const resolved = resolve(theme)
    localStorage.setItem('theme', theme)
    beginTransition(set, () => {
      applyTheme(resolved, true)
      set({ theme, resolved })
    })
  },
  setColorTheme: (colorTheme) => {
    localStorage.setItem('color-theme', colorTheme)
    // Color-theme switches change CSS variables and can also produce a brief
    // visual jump across cards/icons — covering it with the same overlay keeps
    // the feel consistent with light/dark switching.
    beginTransition(set, () => {
      applyColorTheme(colorTheme)
      set({ colorTheme })
    })
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
