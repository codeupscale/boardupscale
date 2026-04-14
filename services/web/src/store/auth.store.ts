import { create } from 'zustand'
import { User } from '@/types'
import { identifyUser, resetPostHog } from '@/lib/posthog'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  setTokens: (accessToken: string, refreshToken: string) => void
  setUser: (user: User) => void
  logout: () => void
  initialize: () => void
}

// Read tokens from localStorage at module load time (synchronous)
const storedAccessToken = localStorage.getItem('accessToken')
const storedRefreshToken = localStorage.getItem('refreshToken')
const hasTokens = !!(storedAccessToken && storedRefreshToken)

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: storedAccessToken,
  refreshToken: storedRefreshToken,
  isAuthenticated: hasTokens,

  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    set({ accessToken, refreshToken, isAuthenticated: true })
  },

  setUser: (user) => {
    set({ user })
    if (user) {
      identifyUser(user.id, {
        email: user.email,
        displayName: user.displayName,
        organizationId: user.organizationId,
        role: user.role,
      })
    }
  },

  logout: () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    resetPostHog()
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
  },

  initialize: () => {
    const accessToken = localStorage.getItem('accessToken')
    const refreshToken = localStorage.getItem('refreshToken')
    if (accessToken && refreshToken) {
      set({ accessToken, refreshToken, isAuthenticated: true })
    }
  },
}))
