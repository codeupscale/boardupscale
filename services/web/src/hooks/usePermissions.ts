import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { Permission, Role } from '@/types'

/**
 * Fetch all available permissions (resource x action combos).
 */
export function usePermissions() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const { data } = await api.get('/permissions')
      return data.data as Permission[]
    },
  })
}

/**
 * Fetch roles for an organization, including global system roles.
 */
export function useRoles(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['roles', organizationId],
    queryFn: async () => {
      const { data } = await api.get(`/organizations/${organizationId}/roles`)
      return data.data as Role[]
    },
    enabled: !!organizationId,
  })
}

/**
 * Fetch a single role by ID.
 */
export function useRole(roleId: string | undefined) {
  return useQuery({
    queryKey: ['role', roleId],
    queryFn: async () => {
      const { data } = await api.get(`/roles/${roleId}`)
      return data.data as Role
    },
    enabled: !!roleId,
  })
}

/**
 * Create a custom role for an organization.
 */
export function useCreateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      organizationId,
      name,
      description,
      permissionIds,
    }: {
      organizationId: string
      name: string
      description?: string
      permissionIds: string[]
    }) => {
      const { data } = await api.post(`/organizations/${organizationId}/roles`, {
        name,
        description,
        permissionIds,
      })
      return data.data as Role
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      toast('Role created successfully')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to create role', 'error'),
  })
}

/**
 * Update a custom role.
 */
export function useUpdateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      roleId,
      name,
      description,
      permissionIds,
    }: {
      roleId: string
      name?: string
      description?: string
      permissionIds?: string[]
    }) => {
      const { data } = await api.put(`/roles/${roleId}`, {
        name,
        description,
        permissionIds,
      })
      return data.data as Role
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      qc.invalidateQueries({ queryKey: ['role'] })
      toast('Role updated successfully')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to update role', 'error'),
  })
}

/**
 * Delete a custom role.
 */
export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (roleId: string) => {
      await api.delete(`/roles/${roleId}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      toast('Role deleted')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to delete role', 'error'),
  })
}

/**
 * Assign a role to a project member.
 */
export function useAssignRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      memberId,
      roleId,
    }: {
      projectId: string
      memberId: string
      roleId: string
    }) => {
      const { data } = await api.post(
        `/projects/${projectId}/members/${memberId}/role`,
        { roleId },
      )
      return data.data
    },
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['project-members', projectId] })
      toast('Role assigned successfully')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to assign role', 'error'),
  })
}
