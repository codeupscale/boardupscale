import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useProjects, useCreateProject } from '@/hooks/useProjects'
import { ProjectCard } from '@/components/projects/project-card'
import { ProjectForm } from '@/components/projects/project-form'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { FolderOpen } from 'lucide-react'

export function ProjectsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const { data: projects, isLoading } = useProjects()
  const createProject = useCreateProject()

  const filtered = projects?.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.key.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Projects"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Search */}
        <div className="max-w-sm">
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Grid */}
        {isLoading ? (
          <LoadingPage />
        ) : filtered && filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FolderOpen className="h-12 w-12" />}
            title={search ? 'No projects match your search' : 'No projects yet'}
            description={
              search
                ? 'Try a different search term'
                : 'Create your first project to start tracking work.'
            }
            action={
              !search
                ? { label: 'Create Project', onClick: () => setShowCreate(true) }
                : undefined
            }
          />
        )}
      </div>

      {/* Create Project Dialog */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)}>
        <DialogHeader onClose={() => setShowCreate(false)}>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <ProjectForm
            onSubmit={(values) =>
              createProject.mutate(values, { onSuccess: () => setShowCreate(false) })
            }
            onCancel={() => setShowCreate(false)}
            isLoading={createProject.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
