import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePageTree, useCreatePage, useDeletePage } from '@/hooks/usePages'
import { useProjects } from '@/hooks/useProjects'
import { useHasPermission } from '@/hooks/useHasPermission'
import { PageTree } from '@/components/pages/page-tree'
import { BookOpen, Plus, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/page-header'
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
import { ConfirmDialog } from '@/components/common/confirm-dialog'

export function ProjectPagesPage() {
  const { key } = useParams<{ key: string }>()
  const navigate = useNavigate()
  const { data: projectsResult } = useProjects()
  const projects = projectsResult?.data
  const project = projects?.find((p) => p.key === key)

  const { data: pages = [], isLoading } = usePageTree(project?.id)
  const { hasPermission } = useHasPermission(key)
  const canCreatePage = hasPermission('page', 'create')
  const createPage = useCreatePage()
  const deletePage = useDeletePage()

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null)

  if (!key) return null

  async function handleCreatePage(parentId?: string) {
    if (!project) return
    try {
      const page = await createPage.mutateAsync({
        projectId: project.id,
        parentPageId: parentId,
        title: 'Untitled',
        content: '',
      })
      navigate(`/projects/${key}/pages/${page.id}`)
    } catch {
      // error handled by mutation's onError
    }
  }

  function handleDeletePage(id: string, title: string) {
    setDeleteConfirm({ id, title })
  }

  async function handleConfirmDelete() {
    if (!deleteConfirm || !project) return
    try {
      await deletePage.mutateAsync({ id: deleteConfirm.id, projectId: project.id })
    } finally {
      setDeleteConfirm(null)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title={project?.name ?? 'Pages'}
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project?.name ?? '...', href: `/projects/${key}/board` },
          { label: 'Pages' },
        ]}
        actions={
          canCreatePage ? (
            <Button size="sm" onClick={() => handleCreatePage()} disabled={!project || createPage.isPending}>
              <Plus size={14} className="mr-1.5" />
              New Page
            </Button>
          ) : undefined
        }
      />
      <ProjectTabNav projectKey={key} />

      <div className="flex flex-1 min-h-0">
        {/* Sidebar — page tree */}
        <div className="w-60 flex-shrink-0 border-r border-border flex flex-col bg-card/50 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
              <BookOpen size={15} />
              Pages
            </div>
            {canCreatePage && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => handleCreatePage()}
                title="New page"
              >
                <Plus size={14} />
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            <PageTree
              pages={pages}
              projectKey={key}
              onCreatePage={handleCreatePage}
              onDeletePage={handleDeletePage}
              loading={isLoading}
            />
          </div>
        </div>

        {/* Main content — empty state when no page selected */}
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <FileText size={32} className="text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {isLoading
              ? 'Loading pages...'
              : pages.length === 0
                ? 'Create your first page'
                : 'Select a page'}
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            {isLoading
              ? ''
              : pages.length === 0
                ? 'Write specs, runbooks, meeting notes, and RFCs — all in one place alongside your issues.'
                : 'Click a page in the sidebar to open it, or create a new one.'}
          </p>
          {canCreatePage && (
            <Button
              onClick={() => handleCreatePage()}
              disabled={createPage.isPending || !project}
              className="gap-2"
            >
              <Plus size={14} />
              New Page
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleConfirmDelete}
        title="Delete page"
        description={
          deleteConfirm
            ? `Delete "${deleteConfirm.title}" and all its sub-pages? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isLoading={deletePage.isPending}
        destructive
      />
    </div>
  )
}
