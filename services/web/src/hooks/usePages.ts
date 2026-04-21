import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { PageTreeNode } from '@/components/pages/page-tree'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Page {
  id: string
  projectId: string
  organizationId: string
  parentPageId: string | null
  creatorId: string
  lastEditorId: string | null
  title: string
  slug: string
  content: string
  icon: string | null
  coverImageUrl: string | null
  status: string
  position: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  creator?: { id: string; displayName: string; avatarUrl?: string }
  lastEditor?: { id: string; displayName: string; avatarUrl?: string }
}

export interface CreatePagePayload {
  projectId: string
  parentPageId?: string
  title?: string
  content?: string
  icon?: string
  status?: string
}

export interface UpdatePagePayload {
  title?: string
  content?: string
  icon?: string
  coverImageUrl?: string
  status?: string
}

export interface MovePagePayload {
  parentPageId?: string | null
  position?: number
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Page tree for a project (nested structure for sidebar).
 */
export function usePageTree(projectId: string | undefined) {
  return useQuery({
    queryKey: ['pages', 'tree', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/pages/project/${projectId}`)
      return data.data as PageTreeNode[]
    },
    enabled: !!projectId,
    staleTime: 30_000,
  })
}

/**
 * Single page with full content.
 */
export function usePage(pageId: string | undefined) {
  return useQuery({
    queryKey: ['pages', pageId],
    queryFn: async () => {
      const { data } = await api.get(`/pages/${pageId}`)
      return data.data as Page
    },
    enabled: !!pageId,
  })
}

/**
 * Breadcrumb ancestors for a page.
 */
export function usePageAncestors(pageId: string | undefined) {
  return useQuery({
    queryKey: ['pages', pageId, 'ancestors'],
    queryFn: async () => {
      const { data } = await api.get(`/pages/${pageId}/ancestors`)
      return data.data as { id: string; title: string }[]
    },
    enabled: !!pageId,
  })
}

/**
 * Create a new page.
 */
export function useCreatePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreatePagePayload) => {
      const { data } = await api.post('/pages', payload)
      return data.data as Page
    },
    onSuccess: (page) => {
      qc.invalidateQueries({ queryKey: ['pages', 'tree', page.projectId] })
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to create page', 'error'),
  })
}

/**
 * Update a page (title, content, icon, status).
 * Silent — used for auto-save (no success toast).
 */
export function useUpdatePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdatePagePayload }) => {
      const { data } = await api.patch(`/pages/${id}`, payload)
      return data.data as Page
    },
    onSuccess: (page) => {
      // Update cached page content
      qc.setQueryData(['pages', page.id], page)
      // Refresh tree (title/icon might have changed)
      qc.invalidateQueries({ queryKey: ['pages', 'tree', page.projectId] })
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to save page', 'error'),
  })
}

/**
 * Move a page to a different parent / position.
 */
export function useMovePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string
      projectId: string
      payload: MovePagePayload
    }) => {
      const { data } = await api.post(`/pages/${id}/move`, payload)
      return data.data as Page
    },
    onSuccess: (_page, variables) => {
      qc.invalidateQueries({ queryKey: ['pages', 'tree', variables.projectId] })
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to move page', 'error'),
  })
}

/**
 * Soft-delete a page (and its children).
 */
export function useDeletePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      await api.delete(`/pages/${id}`)
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['pages', 'tree', variables.projectId] })
      qc.removeQueries({ queryKey: ['pages', variables.id] })
      toast('Page deleted')
    },
    onError: (err: any) =>
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to delete page', 'error'),
  })
}
