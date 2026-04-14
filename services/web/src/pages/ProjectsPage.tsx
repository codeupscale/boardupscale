import { useState, useCallback } from 'react'
import { Plus, Search, FolderOpen, LayoutGrid, List, Layers, CheckCircle2, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProjects, useCreateProject } from '@/hooks/useProjects'
import { useAuthStore } from '@/store/auth.store'
import { ProjectCard } from '@/components/projects/project-card'
import { ProjectForm } from '@/components/projects/project-form'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LoadingPage } from '@/components/ui/spinner'
import { PageHeader } from '@/components/common/page-header'
import { Pagination } from '@/components/ui/pagination'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { ProjectType, UserRole } from '@/types'

const LIMIT = 12

type ViewMode = 'grid' | 'list'

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number | undefined
  color: string
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 flex items-center gap-4">
      <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">
          {value ?? '—'}
        </p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

export function ProjectsPage() {
  const { t } = useTranslation()
  const currentUser = useAuthStore((s) => s.user)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  const debouncedSearch = useDebounce(search, 300)

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value)
      setPage(1)
    },
    [],
  )

  const { data: result, isLoading } = useProjects({
    search: debouncedSearch || undefined,
    page,
    limit: LIMIT,
  })

  const projects = result?.data ?? []
  const meta = result?.meta

  // Use meta.total from the paginated API response for the true count
  // (the API already filters by organizationId and membership)
  const totalProjects = meta?.total ?? 0
  const activeProjects = projects.filter((p) => p.status === 'active').length
  const myProjects = projects.filter((p) => p.ownerId === currentUser?.id).length

  const canCreateProject = currentUser?.role === UserRole.OWNER || currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.MANAGER
  const createProject = useCreateProject()

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const isEmpty = !isLoading && projects.length === 0

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('projects.title')}
        actions={
          canCreateProject ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              {t('projects.newProject')}
            </Button>
          ) : undefined
        }
      />

      <div className="p-6 space-y-6">
        {/* Hero stats bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={<FolderOpen className="h-5 w-5 text-primary" />}
            label="Total Projects"
            value={totalProjects}
            color="bg-primary/10"
          />
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
            label="Active Projects"
            value={activeProjects}
            color="bg-green-50 dark:bg-green-900/20"
          />
          <StatCard
            icon={<User className="h-5 w-5 text-purple-600" />}
            label="My Projects"
            value={myProjects}
            color="bg-purple-50 dark:bg-purple-900/20"
          />
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder={t('projects.searchProjects')}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm"
              aria-label="Search projects"
            />
          </div>

          {/* View toggle */}
          <div
            className="flex items-center rounded-lg border border-border bg-card p-0.5"
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                viewMode === 'grid'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:text-foreground',
              )}
              aria-pressed={viewMode === 'grid'}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                viewMode === 'list'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:text-foreground',
              )}
              aria-pressed={viewMode === 'list'
              }
              title="List view"
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
        </div>

        {/* Results count */}
        {!isLoading && meta && (
          <p className="text-sm text-muted-foreground">
            {meta.total === 0
              ? 'No projects found'
              : `${meta.total} project${meta.total !== 1 ? 's' : ''}`}
            {debouncedSearch && ` matching "${debouncedSearch}"`}
          </p>
        )}

        {/* Content */}
        {isLoading ? (
          <LoadingPage />
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
              <FolderOpen className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {debouncedSearch ? t('projects.noProjectsMatch') : t('projects.noProjects')}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              {debouncedSearch
                ? t('projects.tryDifferentSearch')
                : t('projects.createFirstProject')}
            </p>
            {!debouncedSearch && canCreateProject && (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />
                {t('projects.createProject')}
              </Button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div
            className="bg-card rounded-xl border border-border overflow-hidden"
            role="table"
            aria-label="Projects list"
          >
            {/* List header */}
            <div className="flex items-center gap-4 px-4 py-2.5 bg-muted border-b border-border">
              <div className="w-8 flex-shrink-0" />
              <div className="w-48 flex-shrink-0 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Project
              </div>
              <div className="w-24 flex-shrink-0 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Type
              </div>
              <div className="flex-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Description
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-shrink-0">
                <span className="flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5" />
                  Issues
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  Members
                </span>
                <span>Updated</span>
              </div>
            </div>
            <div role="rowgroup">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} listView />
              ))}
            </div>
          </div>
        )}

        {/* Pagination */}
        {meta && (
          <Pagination
            page={page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={LIMIT}
            onPageChange={handlePageChange}
          />
        )}
      </div>

      {/* Create Project Dialog */}
      <Dialog open={showCreate} onOpenChange={(isOpen) => !isOpen && setShowCreate(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('projects.createNewProject')}</DialogTitle>
          </DialogHeader>
          <ProjectForm
            onSubmit={(values) =>
              createProject.mutate(
                {
                  name: values.name,
                  key: values.key,
                  description: values.description,
                  type: values.type,
                  templateType: values.templateType,
                },
                { onSuccess: () => setShowCreate(false) },
              )
            }
            onCancel={() => setShowCreate(false)}
            isLoading={createProject.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
