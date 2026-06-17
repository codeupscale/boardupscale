import { useMutation, useQuery, useQueryClient, type QueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { mergeCreatedIssue } from '@/lib/issue-reorder'
import { resolveIssueSprint } from '@/lib/issue-display'
import {
  shouldShowIssueOnBoard,
} from '@/lib/project-workflow'
import { BoardData, Issue, ProjectType, Sprint, WorkLog } from '@/types'

export type CreateIssueVariables = {
  projectId: string
  /** Pass when available — avoids cache lookup for optimistic board updates */
  projectType?: ProjectType
  title: string
  description?: string
  type: string
  priority: string
  statusId?: string
  assigneeId?: string
  parentId?: string
  sprintId?: string
  dueDate?: string
  storyPoints?: number
  timeEstimate?: number
  labels?: string[]
}

function prependIssueToBoard(board: BoardData, issue: Issue): BoardData {
  const existsInColumn = board.statuses.some(
    (col) => col.id === issue.statusId && col.issues.some((i) => i.id === issue.id),
  )

  return {
    statuses: board.statuses.map((col) => {
      if (col.id !== issue.statusId) return col
      const issues = mergeCreatedIssue(col.issues, issue)
      return {
        ...col,
        issues,
        total: existsInColumn ? col.total : col.total + 1,
      }
    }),
  }
}

/** In-memory board sync when sprint assignment changes on the backlog — no extra API calls. */
export function syncBoardCacheAfterSprintMove(
  board: BoardData,
  issue: Issue,
  destSprintId: string | null,
  position?: number,
  sprintLookup?: ReadonlyArray<Pick<Sprint, 'id' | 'name' | 'status'>>,
): BoardData {
  if (!board?.statuses?.length) return board

  const updatedIssue: Issue = {
    ...issue,
    sprintId: destSprintId ?? undefined,
    sprint: resolveIssueSprint(destSprintId, issue, sprintLookup),
    ...(position !== undefined ? { position } : {}),
  }

  const withoutIssue: BoardData = {
    statuses: board.statuses.map((col) => {
      const hadIssue = col.issues.some((i) => i.id === issue.id)
      return {
        ...col,
        issues: col.issues.filter((i) => i.id !== issue.id),
        total: hadIssue ? Math.max(0, col.total - 1) : col.total,
      }
    }),
  }

  return prependIssueToBoard(withoutIssue, updatedIssue)
}

export function patchBoardCachesForSprintMove(
  qc: QueryClient,
  issue: Issue,
  destSprintId: string | null,
  position?: number,
  sprintLookup?: ReadonlyArray<Pick<Sprint, 'id' | 'name' | 'status'>>,
) {
  qc.setQueriesData<BoardData>({ queryKey: ['board'] }, (old) => {
    if (!old?.statuses) return old
    return syncBoardCacheAfterSprintMove(old, issue, destSprintId, position, sprintLookup)
  })
}

export interface IssueFilters {
  projectId?: string
  sprintId?: string
  assigneeId?: string
  type?: string
  priority?: string
  statusId?: string
  search?: string
  page?: number
  limit?: number
  deleted?: boolean
  parentless?: boolean
  /** Comma-separated list of issue types to omit, e.g. "epic,subtask". */
  excludeTypes?: string
  /**
   * Bypass server-side pagination for this query. Backlog page uses this to
   * fetch every issue in the project at once so completed sprints render in
   * full. Other consumers should leave this unset and keep pagination.
   */
  noLimit?: boolean
}

type IssuesQueryData = { data: Issue[]; total: number; page: number; limit: number }

type IssuesQueryOptions = Pick<
  UseQueryOptions<IssuesQueryData>,
  'staleTime' | 'refetchOnWindowFocus' | 'structuralSharing'
>

export function useIssues(filters: IssueFilters | undefined = {}, queryOptions?: IssuesQueryOptions) {
  return useQuery({
    queryKey: ['issues', filters],
    enabled: filters !== undefined,
    queryFn: async () => {
      const params = Object.fromEntries(
        Object.entries(filters ?? {}).filter(([, v]) => v !== undefined && v !== ''),
      )
      const { data } = await api.get('/issues', { params })
      return { data: data.data as Issue[], total: data.meta?.total ?? 0, page: data.meta?.page ?? 1, limit: data.meta?.limit ?? 25 }
    },
    ...queryOptions,
  })
}

export function useIssue(id: string) {
  return useQuery({
    queryKey: ['issue', id],
    queryFn: async () => {
      const { data } = await api.get(`/issues/${id}`)
      return data.data as Issue
    },
    enabled: !!id,
  })
}

export function useCreateIssue() {
  const qc = useQueryClient()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: async ({ projectType: _projectType, ...payload }: CreateIssueVariables) => {
      const { data } = await api.post('/issues', payload)
      return data.data as Issue
    },
    onSuccess: (issue, variables) => {
      qc.setQueriesData<{ data: Issue[] }>({ queryKey: ['issues'] }, (old) => {
        if (!old?.data) return old
        return { ...old, data: mergeCreatedIssue(old.data, issue) }
      })

      if (shouldShowIssueOnBoard(issue)) {
        qc.setQueriesData<BoardData>({ queryKey: ['board'] }, (old) => {
          if (!old?.statuses) return old
          return prependIssueToBoard(old, issue)
        })
      }

      const key = issue.key || `#${issue.number}`
      toast(t('issues.createdSuccess', { key }), 'success', { duration: 3000 })
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to create issue', 'error'),
  })
}

export function useUpdateIssue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string
      title?: string
      description?: string
      type?: string
      priority?: string
      statusId?: string
      assigneeId?: string | null
      parentId?: string | null
      sprintId?: string | null
      dueDate?: string | null
      storyPoints?: number | null
      timeEstimate?: number | null
      labels?: string[]
    }) => {
      const { data } = await api.patch(`/issues/${id}`, payload)
      return data.data as Issue
    },
    onMutate: async ({ id, ...payload }) => {
      // Cancel in-flight queries so they don't overwrite optimistic update
      await qc.cancelQueries({ queryKey: ['issue', id] })
      const previous = qc.getQueryData<Issue>(['issue', id])
      if (previous) {
        qc.setQueryData<Issue>(['issue', id], { ...previous, ...payload } as Issue)
      }
      return { previous, id }
    },
    onSuccess: (issue) => {
      // Replace cache with server response (authoritative)
      qc.setQueryData(['issue', issue.id], issue)
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['board'] })
      toast('Issue updated')
    },
    onError: (err: any, _variables, context) => {
      // Roll back optimistic update
      if (context?.previous) {
        qc.setQueryData(['issue', context.id], context.previous)
      }
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to update issue', 'error')
    },
  })
}

/** Silent issue update — no toast, for drag-and-drop operations */
export function useMoveIssueSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      sprintId,
    }: {
      id: string
      sprintId: string | null
    }) => {
      const { data } = await api.patch(`/issues/${id}`, { sprintId })
      return data.data as Issue
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['board'] })
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to move issue', 'error'),
  })
}

export function useDeleteIssue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      await api.delete(`/issues/${id}`)
      return { projectId }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issues'] })
      qc.invalidateQueries({ queryKey: ['board'] })
      toast('Issue deleted')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to delete issue', 'error'),
  })
}

export function useWorkLogs(issueId: string) {
  return useQuery({
    queryKey: ['worklogs', issueId],
    queryFn: async () => {
      const { data } = await api.get(`/issues/${issueId}/work-logs`)
      return data.data as WorkLog[]
    },
    enabled: !!issueId,
  })
}

export function useAddWorkLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      issueId,
      timeSpent,
      description,
      loggedAt,
    }: {
      issueId: string
      timeSpent: number
      description?: string
      loggedAt?: string
    }) => {
      const { data } = await api.post(`/issues/${issueId}/work-log`, {
        timeSpent,
        description,
        loggedAt,
      })
      return data.data as WorkLog
    },
    onSuccess: (_, { issueId }) => {
      qc.invalidateQueries({ queryKey: ['worklogs', issueId] })
      qc.invalidateQueries({ queryKey: ['issue', issueId] })
      toast('Work logged')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to log work', 'error'),
  })
}
