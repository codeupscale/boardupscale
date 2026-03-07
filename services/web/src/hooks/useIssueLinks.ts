import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { IssueLink, IssueLinkType } from '@/types'

export function useIssueLinks(issueId: string) {
  return useQuery({
    queryKey: ['issue-links', issueId],
    queryFn: async () => {
      const { data } = await api.get(`/issues/${issueId}/links`)
      return data.data as IssueLink[]
    },
    enabled: !!issueId,
  })
}

export function useCreateIssueLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      issueId,
      targetIssueId,
      linkType,
    }: {
      issueId: string
      targetIssueId: string
      linkType: IssueLinkType
    }) => {
      const { data } = await api.post(`/issues/${issueId}/links`, {
        targetIssueId,
        linkType,
      })
      return data.data as IssueLink
    },
    onSuccess: (_, { issueId }) => {
      qc.invalidateQueries({ queryKey: ['issue-links', issueId] })
      toast('Link created')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || 'Failed to create link', 'error'),
  })
}

export function useDeleteIssueLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ issueId, linkId }: { issueId: string; linkId: string }) => {
      await api.delete(`/issues/${issueId}/links/${linkId}`)
      return { issueId }
    },
    onSuccess: ({ issueId }) => {
      qc.invalidateQueries({ queryKey: ['issue-links', issueId] })
      toast('Link removed')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || 'Failed to remove link', 'error'),
  })
}
