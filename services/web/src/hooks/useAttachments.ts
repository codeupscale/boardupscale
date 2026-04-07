import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { Attachment } from '@/types'

export function useAttachments(issueId: string) {
  return useQuery({
    queryKey: ['attachments', issueId],
    queryFn: async () => {
      const { data } = await api.get('/files', { params: { issueId } })
      return data.data as Attachment[]
    },
    enabled: !!issueId,
  })
}

export function useUploadAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      file,
      issueId,
    }: {
      file: File
      issueId: string
    }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('issueId', issueId)
      const { data } = await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data.data as Attachment
    },
    onSuccess: (_, { issueId }) => {
      qc.invalidateQueries({ queryKey: ['attachments', issueId] })
      toast('File uploaded')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || 'Failed to upload file', 'error'),
  })
}

export function useDeleteAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, issueId }: { id: string; issueId: string }) => {
      await api.delete(`/files/${id}`)
      return { issueId }
    },
    onSuccess: (_, { issueId }) => {
      qc.invalidateQueries({ queryKey: ['attachments', issueId] })
      toast('File deleted')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || 'Failed to delete file', 'error'),
  })
}
