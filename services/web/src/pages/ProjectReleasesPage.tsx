import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Rocket, Calendar, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import {
  useVersions,
  useCreateVersion,
  useReleaseVersion,
  useVersionProgress,
} from '@/hooks/useVersions'
import { useProject } from '@/hooks/useProjects'
import { ProjectVersion, VersionProgress } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { LoadingPage } from '@/components/ui/spinner'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

function VersionProgressBar({ versionId }: { versionId: string }) {
  const { data: progress } = useVersionProgress(versionId)

  if (!progress || progress.total === 0) {
    return (
      <div className="text-xs text-gray-400">No issues linked</div>
    )
  }

  const donePercent = (progress.done / progress.total) * 100
  const inProgressPercent = (progress.inProgress / progress.total) * 100
  const todoPercent = (progress.todo / progress.total) * 100

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
        {donePercent > 0 && (
          <div
            className="bg-green-500 transition-all"
            style={{ width: `${donePercent}%` }}
          />
        )}
        {inProgressPercent > 0 && (
          <div
            className="bg-blue-500 transition-all"
            style={{ width: `${inProgressPercent}%` }}
          />
        )}
        {todoPercent > 0 && (
          <div
            className="bg-gray-300 transition-all"
            style={{ width: `${todoPercent}%` }}
          />
        )}
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-green-500" />
          {progress.done} Done
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3 text-blue-500" />
          {progress.inProgress} In Progress
        </span>
        <span className="flex items-center gap-1">
          <AlertCircle className="h-3 w-3 text-gray-400" />
          {progress.todo} To Do
        </span>
      </div>
    </div>
  )
}

function VersionCard({
  version,
  projectId,
}: {
  version: ProjectVersion
  projectId: string
}) {
  const releaseVersion = useReleaseVersion()

  const isReleased = version.status === 'released'
  const isArchived = version.status === 'archived'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-gray-900">{version.name}</h3>
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                isReleased
                  ? 'bg-green-100 text-green-700'
                  : isArchived
                  ? 'bg-gray-100 text-gray-500'
                  : 'bg-amber-100 text-amber-700',
              )}
            >
              {version.status}
            </span>
          </div>
          {version.description && (
            <p className="text-sm text-gray-500">{version.description}</p>
          )}
        </div>
        {version.status === 'unreleased' && (
          <Button
            size="sm"
            onClick={() =>
              releaseVersion.mutate({ id: version.id, projectId })
            }
            isLoading={releaseVersion.isPending}
          >
            <Rocket className="h-3.5 w-3.5" />
            Release
          </Button>
        )}
      </div>

      <div className="flex gap-4 mb-3 text-xs text-gray-400">
        {version.startDate && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Start: {formatDate(version.startDate)}
          </span>
        )}
        {version.releaseDate && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Target: {formatDate(version.releaseDate)}
          </span>
        )}
        {version.releasedAt && (
          <span className="flex items-center gap-1">
            <Rocket className="h-3 w-3 text-green-500" />
            Released: {formatDate(version.releasedAt)}
          </span>
        )}
      </div>

      <VersionProgressBar versionId={version.id} />
    </div>
  )
}

export function ProjectReleasesPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const { data: project, isLoading: projectLoading } = useProject(projectId!)
  const { data: versions, isLoading: versionsLoading } = useVersions(projectId!)
  const createVersion = useCreateVersion()

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [releaseDate, setReleaseDate] = useState('')

  if (projectLoading || versionsLoading) return <LoadingPage />

  const unreleased = versions?.filter((v) => v.status === 'unreleased') || []
  const released = versions?.filter((v) => v.status === 'released') || []
  const archived = versions?.filter((v) => v.status === 'archived') || []

  const handleCreate = () => {
    createVersion.mutate(
      {
        projectId: projectId!,
        name,
        description: description || undefined,
        startDate: startDate || undefined,
        releaseDate: releaseDate || undefined,
      },
      {
        onSuccess: () => {
          setShowCreate(false)
          setName('')
          setDescription('')
          setStartDate('')
          setReleaseDate('')
        },
      },
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Releases"
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectId}/board` },
          { label: 'Releases' },
        ]}
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Create Version
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Unreleased */}
        {unreleased.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Unreleased ({unreleased.length})
            </h2>
            <div className="space-y-3">
              {unreleased.map((v) => (
                <VersionCard key={v.id} version={v} projectId={projectId!} />
              ))}
            </div>
          </div>
        )}

        {/* Released */}
        {released.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Released ({released.length})
            </h2>
            <div className="space-y-3">
              {released.map((v) => (
                <VersionCard key={v.id} version={v} projectId={projectId!} />
              ))}
            </div>
          </div>
        )}

        {/* Archived */}
        {archived.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Archived ({archived.length})
            </h2>
            <div className="space-y-3">
              {archived.map((v) => (
                <VersionCard key={v.id} version={v} projectId={projectId!} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {(!versions || versions.length === 0) && (
          <div className="text-center py-16">
            <Rocket className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No versions yet</h3>
            <p className="text-sm text-gray-500 mb-4">
              Create your first version to start tracking releases.
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Create Version
            </Button>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        className="max-w-sm"
      >
        <DialogHeader onClose={() => setShowCreate(false)}>
          <DialogTitle>Create Version</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <Input
            label="Version Name"
            placeholder="e.g. v1.0.0"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            label="Description (optional)"
            placeholder="What will be included in this version?"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              label="Release Date"
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim()}
              isLoading={createVersion.isPending}
              onClick={handleCreate}
            >
              Create Version
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
