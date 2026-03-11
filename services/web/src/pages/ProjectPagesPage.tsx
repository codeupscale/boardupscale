import { useParams, useNavigate } from 'react-router-dom'
import { usePageTree, useCreatePage, useDeletePage } from '@/hooks/usePages'
import { useProjects } from '@/hooks/useProjects'
import { PageTree } from '@/components/pages/page-tree'
import { BookOpen, Plus, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ProjectPagesPage() {
  const { key } = useParams<{ key: string }>()
  const navigate = useNavigate()
  const { data: projects } = useProjects()
  const project = projects?.find((p) => p.key === key)

  const { data: pages = [], isLoading } = usePageTree(project?.id)
  const createPage = useCreatePage()
  const deletePage = useDeletePage()

  async function handleCreatePage(parentId?: string) {
    if (!project) return
    const page = await createPage.mutateAsync({
      projectId: project.id,
      parentPageId: parentId,
      title: 'Untitled',
      content: '',
    })
    navigate(`/projects/${key}/pages/${page.id}`)
  }

  async function handleDeletePage(id: string, title: string) {
    if (!project) return
    if (!confirm(`Delete "${title}" and all its sub-pages? This cannot be undone.`)) return
    await deletePage.mutateAsync({ id, projectId: project.id })
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar — page tree */}
      <div className="w-60 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            <BookOpen size={15} />
            Pages
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => handleCreatePage()}
            title="New page"
          >
            <Plus size={14} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          <PageTree
            pages={pages}
            projectKey={key || ''}
            onCreatePage={handleCreatePage}
            onDeletePage={handleDeletePage}
            loading={isLoading}
          />
        </div>
      </div>

      {/* Main content — empty state when no page selected */}
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50 dark:bg-gray-900">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-4">
          <FileText size={32} className="text-blue-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {pages.length === 0 ? 'Create your first page' : 'Select a page'}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
          {pages.length === 0
            ? 'Write specs, runbooks, meeting notes, and RFCs — all in one place alongside your issues.'
            : 'Click a page in the sidebar to open it, or create a new one.'}
        </p>
        <Button
          onClick={() => handleCreatePage()}
          disabled={createPage.isPending || !project}
          className="gap-2"
        >
          <Plus size={14} />
          New Page
        </Button>
      </div>
    </div>
  )
}
