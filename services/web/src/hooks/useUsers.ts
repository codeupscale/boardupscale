import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { User } from '@/types'

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/users')
      return data.data as User[]
    },
  })
}

export function useUser(id: string) {
  return useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const { data } = await api.get(`/users/${id}`)
      return data.data as User
    },
    enabled: !!id,
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      displayName?: string
      avatarUrl?: string
      timezone?: string
      language?: string
    }) => {
      const { data } = await api.patch('/users/me', payload)
      return data.data as User
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] })
      toast('Profile updated')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to update profile', 'error'),
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (payload: {
      currentPassword: string
      newPassword: string
    }) => {
      const { data } = await api.post('/users/me/change-password', payload)
      return data.data
    },
    onSuccess: () => toast('Password changed successfully'),
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to change password', 'error'),
  })
}
