import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { toast } from '@/store/ui.store'
import { User } from '@/types'

interface AuthProviders {
  google: boolean
  github: boolean
  saml: boolean
}

export function useAuthProviders() {
  return useQuery({
    queryKey: ['auth-providers'],
    queryFn: async () => {
      const { data } = await api.get('/auth/providers')
      return data as AuthProviders
    },
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
  })
}

export function useMe() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data } = await api.get('/auth/me')
      return data.data as User
    },
    enabled: isAuthenticated,
  })
}

export function useLogin() {
  const setTokens = useAuthStore((s) => s.setTokens)
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async (payload: { email: string; password: string }) => {
      const { data } = await api.post('/auth/login', payload)
      return data.data
    },
    onSuccess: (data) => {
      // If 2FA is required, don't set tokens — let the LoginPage handle it
      if (data?.requiresTwoFactor) return
      setTokens(data.accessToken, data.refreshToken)
      toast('Logged in successfully')
      navigate('/')
    },
    // Error handling is done in the LoginPage component to support
    // lockout (423) and email verification notices
  })
}

export function useRegister() {
  return useMutation({
    mutationFn: async (payload: {
      email: string
      password: string
      displayName: string
      organizationName: string
    }) => {
      const { data } = await api.post('/auth/register', payload)
      return data.data
    },
    onError: (err: any) => {
      const data = err?.response?.data
      // Show password policy violations if present
      if (data?.violations && Array.isArray(data.violations)) {
        toast(data.violations.join('. '), 'error')
      } else {
        toast(data?.message || data?.error?.message || 'Registration failed', 'error')
      }
    },
  })
}

export function useSetup2FA() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/auth/2fa/setup')
      return data.data as { secret: string; qrCodeUrl: string }
    },
  })
}

export function useConfirm2FA() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => {
      const { data } = await api.post('/auth/2fa/confirm', { code })
      return data.data as { backupCodes: string[] }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] })
      toast('Two-factor authentication enabled')
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Invalid verification code', 'error')
    },
  })
}

export function useVerify2FA() {
  const setTokens = useAuthStore((s) => s.setTokens)
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async (payload: { tempToken: string; code: string }) => {
      const { data } = await api.post('/auth/2fa/verify', payload)
      return data.data
    },
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken)
      toast('Logged in successfully')
      navigate('/')
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Invalid 2FA code', 'error')
    },
  })
}

export function useDisable2FA() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (password: string) => {
      const { data } = await api.post('/auth/2fa/disable', { password })
      return data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] })
      toast('Two-factor authentication disabled')
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Failed to disable 2FA', 'error')
    },
  })
}

export function useRegenerateBackupCodes() {
  return useMutation({
    mutationFn: async (password: string) => {
      const { data } = await api.post('/auth/2fa/backup-codes', { password })
      return data.data as { backupCodes: string[] }
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Failed to regenerate codes', 'error')
    },
  })
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const refreshToken = localStorage.getItem('refreshToken')
      if (refreshToken) await api.post('/auth/logout', { refreshToken })
    },
    onSettled: () => {
      logout()
      qc.clear()
      navigate('/login')
    },
  })
}
