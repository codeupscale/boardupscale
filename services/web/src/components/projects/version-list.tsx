import { useState } from 'react'
import { Plus, Trash2, Edit2, Rocket } from 'lucide-react'
import { ProjectVersion } from '@/types'
import {
  useVersions,
  useCreateVersion,
  useUpdateVersion,
  useDeleteVersion,
  useReleaseVersion,
} from '@/hooks/useVersions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { formatDate } from '@/lib/utils'

interface VersionListProps {
  projectId: string
}

const statusStyles: Record<string, string> = {
  unreleased: 'bg-amber-100 text-amber-700',
  released: 'bg-green-100 text-green-700',
  archived: 'bg-muted text-muted-foreground',
}

export function VersionList({ projectId }: VersionListProps) {
  const { data: versions } = useVersions(projectId)
  const createVersion = useCreateVersion()
  const updateVersion = useUpdateVersion()
  const deleteVersion = useDeleteVersion()
  const releaseVersion = useReleaseVersion()

  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<ProjectVersion | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [releaseDate, setReleaseDate] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProjectVersion | null>(null)

  const openCreate = () => {
    setEditing(null)
    setName('')
    setDescription('')
    setStartDate('')
    setReleaseDate('')
    setShowDialog(true)
  }

  const openEdit = (version: ProjectVersion) => {
    setEditing(version)
    setName(version.name)
    setDescription(version.description || '')
    setStartDate(version.startDate || '')
    setReleaseDate(version.releaseDate || '')
    setShowDialog(true)
  }

  const handleSubmit = () => {
    if (editing) {
      updateVersion.mutate(
        {
          id: editing.id,
          name,
          description: description || undefined,
          startDate: startDate || undefined,
          releaseDate: releaseDate || undefined,
        },
        { onSuccess: () => setShowDialog(false) },
      )
    } else {
      createVersion.mutate(
        {
          projectId,
          name,
          description: description || undefined,
          startDate: startDate || undefined,
          releaseDate: releaseDate || undefined,
        },
        { onSuccess: () => setShowDialog(false) },
      )
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground">Versions</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Version
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border divide-y divide-border">
        {versions?.map((version) => (
          <div key={version.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{version.name}</p>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    statusStyles[version.status] || statusStyles.unreleased
                  }`}
                >
                  {version.status}
                </span>
              </div>
              {version.description && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {version.description}
                </p>
              )}
              <div className="flex gap-3 mt-1">
                {version.startDate && (
                  <span className="text-xs text-muted-foreground">
                    Start: {formatDate(version.startDate)}
                  </span>
                )}
                {version.releaseDate && (
                  <span className="text-xs text-muted-foreground">
                    Release: {formatDate(version.releaseDate)}
                  </span>
                )}
              </div>
            </div>
            {version.status === 'unreleased' && (
              <Button
                variant="outline"
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
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => openEdit(version)}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-red-600"
              onClick={() => setDeleteTarget(version)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {(!versions || versions.length === 0) && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No versions configured.
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog
        open={showDialog}
        onOpenChange={(isOpen) => !isOpen && setShowDialog(false)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Version' : 'Add Version'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Version Name"
              placeholder="e.g. v1.0.0"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Textarea
              label="Description (optional)"
              placeholder="Describe this version..."
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
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button
                disabled={!name.trim()}
                isLoading={createVersion.isPending || updateVersion.isPending}
                onClick={handleSubmit}
              >
                {editing ? 'Save' : 'Add'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteVersion.mutate(
              { id: deleteTarget.id, projectId },
              { onSuccess: () => setDeleteTarget(null) },
            )
          }
        }}
        title="Delete Version"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? Issues linked to this version will be unlinked.`}
        confirmLabel="Delete"
        destructive
        isLoading={deleteVersion.isPending}
      />
    </div>
  )
}
