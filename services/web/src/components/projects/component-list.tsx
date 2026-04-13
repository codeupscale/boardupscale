import { useState } from 'react'
import { Plus, Trash2, Edit2 } from 'lucide-react'
import { ProjectComponent } from '@/types'
import {
  useComponents,
  useCreateComponent,
  useUpdateComponent,
  useDeleteComponent,
} from '@/hooks/useComponents'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar } from '@/components/ui/avatar'
import { UserSelect } from '@/components/common/user-select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'

interface ComponentListProps {
  projectId: string
}

export function ComponentList({ projectId }: ComponentListProps) {
  const { data: components } = useComponents(projectId)
  const createComponent = useCreateComponent()
  const updateComponent = useUpdateComponent()
  const deleteComponent = useDeleteComponent()

  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<ProjectComponent | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [leadId, setLeadId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProjectComponent | null>(null)

  const openCreate = () => {
    setEditing(null)
    setName('')
    setDescription('')
    setLeadId(null)
    setShowDialog(true)
  }

  const openEdit = (component: ProjectComponent) => {
    setEditing(component)
    setName(component.name)
    setDescription(component.description || '')
    setLeadId(component.leadId || null)
    setShowDialog(true)
  }

  const handleSubmit = () => {
    if (editing) {
      updateComponent.mutate(
        {
          id: editing.id,
          name,
          description: description || undefined,
          leadId: leadId || undefined,
        },
        { onSuccess: () => setShowDialog(false) },
      )
    } else {
      createComponent.mutate(
        {
          projectId,
          name,
          description: description || undefined,
          leadId: leadId || undefined,
        },
        { onSuccess: () => setShowDialog(false) },
      )
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Components</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Component
        </Button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
        {components?.map((component) => (
          <div key={component.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{component.name}</p>
              {component.description && (
                <p className="text-xs text-gray-500 truncate">
                  {component.description}
                </p>
              )}
            </div>
            {component.lead && (
              <div className="flex items-center gap-1.5">
                <Avatar user={component.lead} size="xs" />
                <span className="text-xs text-gray-500">
                  {component.lead.displayName}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => openEdit(component)}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-gray-400 hover:text-red-600"
              onClick={() => setDeleteTarget(component)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {(!components || components.length === 0) && (
          <div className="py-8 text-center text-sm text-gray-500">
            No components configured.
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
            <DialogTitle>{editing ? 'Edit Component' : 'Add Component'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Name"
              placeholder="e.g. Authentication"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Textarea
              label="Description (optional)"
              placeholder="What is this component responsible for?"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Lead (optional)
              </label>
              <UserSelect value={leadId} onChange={setLeadId} placeholder="Select lead..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button
                disabled={!name.trim()}
                isLoading={createComponent.isPending || updateComponent.isPending}
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
            deleteComponent.mutate(
              { id: deleteTarget.id, projectId },
              { onSuccess: () => setDeleteTarget(null) },
            )
          }
        }}
        title="Delete Component"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? Issues using this component will be unlinked.`}
        confirmLabel="Delete"
        destructive
        isLoading={deleteComponent.isPending}
      />
    </div>
  )
}
