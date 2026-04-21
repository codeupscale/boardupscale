import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { User, OrganizationMembership } from '@/types'

export interface MergePreviewImpact {
  issuesReassigned: number
  commentsReassigned: number
  projectMemberships: number
  worklogsReassigned: number
  watchersReassigned: number
}

export interface MergePreview {
  placeholder: { id: string; displayName: string; email: string }
  targetUser: { id: string; displayName: string; email: string } | null
  impact: MergePreviewImpact
  conflict: boolean
}

export function useMyMemberships() {
  return useQuery({
    queryKey: ['my-memberships'],
    queryFn: async () => {
      const { data } = await api.get('/organizations/my-memberships')
      return data.data as OrganizationMembership[]
    },
  })
}

export function useSwitchOrg() {
  const setTokens = useAuthStore((s) => s.setTokens)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { data } = await api.post('/auth/switch-org', { organizationId })
      return data.data ?? data
    },
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken)
      // Clear all cached data since it's org-scoped
      qc.clear()
      // Reload to refresh all data with new org context
      window.location.href = '/'
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Failed to switch organization', 'error')
    },
  })
}

export function useOrgMembers() {
  return useQuery({
    queryKey: ['org-members'],
    queryFn: async () => {
      const { data } = await api.get('/organizations/me/members')
      return data.data as User[]
    },
  })
}

export function useInviteMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { email: string; displayName?: string; role?: string }) => {
      const { data } = await api.post('/organizations/invite', payload)
      return data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members'] })
      toast('Invitation sent')
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Failed to send invitation', 'error')
    },
  })
}

export function useUpdateMemberEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      memberId,
      email,
      confirmMerge,
    }: {
      memberId: string
      email: string
      confirmMerge?: boolean
    }) => {
      const { data } = await api.patch(`/organizations/me/members/${memberId}/email`, {
        email,
        confirmMerge,
      })
      return data.data as User
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['org-members'] })
      const msg = variables.confirmMerge
        ? `Accounts merged. Invitation sent to ${variables.email}`
        : 'Email updated — invitation sent'
      toast(msg)
    },
    // No onError — callers handle errors themselves (409 triggers merge modal)
  })
}

export function useMergePreview(memberId: string, email: string, enabled: boolean) {
  return useQuery({
    queryKey: ['merge-preview', memberId, email],
    queryFn: async () => {
      const { data } = await api.get(
        `/organizations/me/members/${memberId}/merge-preview?email=${encodeURIComponent(email)}`,
      )
      return data.data as MergePreview
    },
    enabled: enabled && !!memberId && !!email,
    retry: false,
  })
}

export function useUpdateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      memberId,
      displayName,
      avatarUrl,
    }: {
      memberId: string
      displayName?: string
      avatarUrl?: string
    }) => {
      const { data } = await api.patch(`/organizations/me/members/${memberId}`, {
        displayName,
        avatarUrl,
      })
      return data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members'] })
      toast('Member updated')
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Failed to update member', 'error')
    },
  })
}

export function useUpdateMemberRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const { data } = await api.patch(`/organizations/me/members/${memberId}/role`, { role })
      return data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members'] })
      toast('Role updated')
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Failed to update role', 'error')
    },
  })
}

export function useDeactivateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { data } = await api.patch(`/organizations/me/members/${memberId}/deactivate`)
      return data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members'] })
      toast('Member deactivated')
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Failed to deactivate member', 'error')
    },
  })
}

export function useResendInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { data } = await api.post(`/organizations/me/members/${memberId}/resend-invite`)
      return data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members'] })
      toast('Invitation resent')
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Failed to resend invitation', 'error')
    },
  })
}

export function useRevokeInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { data } = await api.delete(`/organizations/me/members/${memberId}/invite`)
      return data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members'] })
      toast('Invitation revoked')
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Failed to revoke invitation', 'error')
    },
  })
}

export function useRepairOrgMemberships() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/organizations/me/members/repair')
      return data as { repairedOrgMembers: number; repairedProjectMembers: number }
    },
    onSuccess: (result) => {
      // Invalidate all project-members queries so every open settings tab refreshes
      qc.invalidateQueries({ queryKey: ['project-members'] })
      qc.invalidateQueries({ queryKey: ['org-members'] })
      const added = result.repairedProjectMembers
      toast(
        added > 0
          ? `Sync complete — ${added} project membership${added === 1 ? '' : 's'} restored`
          : 'All memberships are already up to date',
      )
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Sync failed — please try again', 'error')
    },
  })
}
