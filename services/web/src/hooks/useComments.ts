import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { Comment } from '@/types'

export function useComments(issueId: string) {
  return useQuery({
    queryKey: ['comments', issueId],
    queryFn: async () => {
      const { data } = await api.get(`/comments`, { params: { issueId } })
      return data.data as Comment[]
    },
    enabled: !!issueId,
  })
}

export function useCreateComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ issueId, content }: { issueId: string; content: string }) => {
      const { data } = await api.post(`/comments`, { issueId, content })
      return data.data as Comment
    },
    onSuccess: (comment) => {
      qc.invalidateQueries({ queryKey: ['comments', comment.issueId] })
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to add comment', 'error'),
  })
}

export function useUpdateComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      issueId,
      commentId,
      content,
    }: {
      issueId: string
      commentId: string
      content: string
    }) => {
      const { data } = await api.patch(`/comments/${commentId}`, { content })
      return data.data as Comment
    },
    onSuccess: (comment) => {
      qc.invalidateQueries({ queryKey: ['comments', comment.issueId] })
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to update comment', 'error'),
  })
}

export function useDeleteComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ issueId, commentId }: { issueId: string; commentId: string }) => {
      await api.delete(`/comments/${commentId}`)
      return { issueId }
    },
    onSuccess: ({ issueId }) => {
      qc.invalidateQueries({ queryKey: ['comments', issueId] })
      toast('Comment deleted')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.error?.message || 'Failed to delete comment', 'error'),
  })
}
