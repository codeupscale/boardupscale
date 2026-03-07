import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { toast } from '@/store/ui.store'
import { User } from '@/types'

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
      setTokens(data.accessToken, data.refreshToken)
      toast('Logged in successfully')
      navigate('/')
    },
    // Error handling is done in the LoginPage component to support
    // lockout (423) and email verification notices
  })
}

export function useRegister() {
  const navigate = useNavigate()
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
    onSuccess: () => {
      toast('Account created! Please check your email to verify your address.')
      navigate('/login')
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
