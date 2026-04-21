import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { CustomFieldDefinition, CustomFieldValue } from '@/types'

export function useCustomFieldDefinitions(projectId: string) {
  return useQuery({
    queryKey: ['custom-field-definitions', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/custom-fields`)
      return data.data as CustomFieldDefinition[]
    },
    enabled: !!projectId,
  })
}

export function useCreateCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      ...payload
    }: {
      projectId: string
      name: string
      fieldKey: string
      fieldType: string
      description?: string
      isRequired?: boolean
      defaultValue?: any
      options?: any
      position?: number
    }) => {
      const { data } = await api.post(
        `/projects/${projectId}/custom-fields`,
        payload,
      )
      return data.data as CustomFieldDefinition
    },
    onSuccess: (field) => {
      qc.invalidateQueries({
        queryKey: ['custom-field-definitions', field.projectId],
      })
      toast('Custom field created')
    },
    onError: (err: any) =>
      toast(
        err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to create custom field',
        'error',
      ),
  })
}

export function useUpdateCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string
      name?: string
      fieldType?: string
      description?: string
      isRequired?: boolean
      defaultValue?: any
      options?: any
      position?: number
    }) => {
      const { data } = await api.put(`/custom-fields/${id}`, payload)
      return data.data as CustomFieldDefinition
    },
    onSuccess: (field) => {
      qc.invalidateQueries({ queryKey: ['custom-field-definitions'] })
      toast('Custom field updated')
    },
    onError: (err: any) =>
      toast(
        err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to update custom field',
        'error',
      ),
  })
}

export function useDeleteCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/custom-fields/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-field-definitions'] })
      toast('Custom field deleted')
    },
    onError: (err: any) =>
      toast(
        err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to delete custom field',
        'error',
      ),
  })
}

export function useIssueCustomFields(issueId: string) {
  return useQuery({
    queryKey: ['issue-custom-fields', issueId],
    queryFn: async () => {
      const { data } = await api.get(`/issues/${issueId}/custom-fields`)
      return data.data as CustomFieldValue[]
    },
    enabled: !!issueId,
  })
}

export function useSetIssueCustomFields() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      issueId,
      values,
    }: {
      issueId: string
      values: Array<{ fieldId: string; value: any }>
    }) => {
      const { data } = await api.put(
        `/issues/${issueId}/custom-fields`,
        values,
      )
      return data.data as CustomFieldValue[]
    },
    onSuccess: (_, { issueId }) => {
      qc.invalidateQueries({ queryKey: ['issue-custom-fields', issueId] })
      toast('Custom fields updated')
    },
    onError: (err: any) =>
      toast(
        err?.response?.data?.message || err?.response?.data?.error?.message ||
          'Failed to update custom fields',
        'error',
      ),
  })
}
