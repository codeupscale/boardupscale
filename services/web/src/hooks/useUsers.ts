import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { User } from '@/types'

interface UserFilters {
  page?: number
  limit?: number
}

export interface DropdownUser {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
}

export function useUsers(filters: UserFilters = {}) {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: async () => {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined),
      )
      const { data } = await api.get('/users', { params })
      return {
        data: data.data as User[],
        meta: data.meta as { total: number; page: number; limit: number; totalPages: number },
      }
    },
    staleTime: 30_000,
  })
}

export function useUsersDropdown() {
  return useQuery({
    queryKey: ['users-dropdown'],
    queryFn: async () => {
      const { data } = await api.get('/users/dropdown')
      return data.data as DropdownUser[]
    },
    staleTime: 60_000,
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
