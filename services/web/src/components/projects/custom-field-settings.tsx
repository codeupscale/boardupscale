import { useState } from 'react'
import { Plus, Trash2, Edit2, GripVertical } from 'lucide-react'
import { CustomFieldDefinition, CustomFieldType, CustomFieldOption } from '@/types'
import {
  useCustomFieldDefinitions,
  useCreateCustomField,
  useUpdateCustomField,
  useDeleteCustomField,
} from '@/hooks/useCustomFields'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'

interface CustomFieldSettingsProps {
  projectId: string
}

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select (single)' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'url', label: 'URL' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'user', label: 'User' },
]

const OPTION_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#6b7280',
]

export function CustomFieldSettings({ projectId }: CustomFieldSettingsProps) {
  const { data: definitions } = useCustomFieldDefinitions(projectId)
  const createField = useCreateCustomField()
  const updateField = useUpdateCustomField()
  const deleteField = useDeleteCustomField()

  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<CustomFieldDefinition | null>(null)
  const [name, setName] = useState('')
  const [fieldKey, setFieldKey] = useState('')
  const [fieldType, setFieldType] = useState<CustomFieldType>('text')
  const [description, setDescription] = useState('')
  const [isRequired, setIsRequired] = useState(false)
  const [options, setOptions] = useState<CustomFieldOption[]>([])
  const [newOptionLabel, setNewOptionLabel] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CustomFieldDefinition | null>(null)

  const needsOptions = fieldType === 'select' || fieldType === 'multi_select'

  const generateKey = (n: string) =>
    n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  const openCreate = () => {
    setEditing(null)
    setName('')
    setFieldKey('')
    setFieldType('text')
    setDescription('')
    setIsRequired(false)
    setOptions([])
    setShowDialog(true)
  }

  const openEdit = (def: CustomFieldDefinition) => {
    setEditing(def)
    setName(def.name)
    setFieldKey(def.fieldKey)
    setFieldType(def.fieldType)
    setDescription(def.description || '')
    setIsRequired(def.isRequired)
    setOptions(def.options || [])
    setShowDialog(true)
  }

  const addOption = () => {
    if (!newOptionLabel.trim()) return
    const value = newOptionLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    const color = OPTION_COLORS[options.length % OPTION_COLORS.length]
    setOptions([...options, { label: newOptionLabel.trim(), value, color }])
    setNewOptionLabel('')
  }

  const removeOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index))
  }

  const handleSubmit = () => {
    if (editing) {
      updateField.mutate(
        {
          id: editing.id,
          name,
          fieldType,
          description: description || undefined,
          isRequired,
          options: needsOptions ? options : undefined,
        },
        { onSuccess: () => setShowDialog(false) },
      )
    } else {
      createField.mutate(
        {
          projectId,
          name,
          fieldKey: fieldKey || generateKey(name),
          fieldType,
          description: description || undefined,
          isRequired,
          options: needsOptions ? options : undefined,
        },
        { onSuccess: () => setShowDialog(false) },
      )
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Custom Fields</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Field
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {definitions?.map((def) => (
          <div key={def.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900">{def.name}</p>
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                  {def.fieldType.replace('_', ' ')}
                </span>
                {def.isRequired && (
                  <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full">
                    required
                  </span>
                )}
              </div>
              {def.description && (
                <p className="text-xs text-gray-500 mt-0.5">{def.description}</p>
              )}
              <p className="text-xs text-gray-500 font-mono mt-0.5">key: {def.fieldKey}</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => openEdit(def)}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-gray-400 hover:text-red-600"
              onClick={() => setDeleteTarget(def)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {(!definitions || definitions.length === 0) && (
          <div className="py-8 text-center text-sm text-gray-500">
            No custom fields configured. Add fields to track additional information on issues.
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        className="max-w-md"
      >
        <DialogHeader onClose={() => setShowDialog(false)}>
          <DialogTitle>{editing ? 'Edit Custom Field' : 'Add Custom Field'}</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <Input
            label="Field Name"
            placeholder="e.g. Environment"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!editing) setFieldKey(generateKey(e.target.value))
            }}
          />
          {!editing && (
            <Input
              label="Field Key"
              placeholder="e.g. environment"
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
            />
          )}
          <Select
            label="Field Type"
            options={FIELD_TYPES}
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
          />
          <Textarea
            label="Description (optional)"
            placeholder="Describe what this field is for..."
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Required field</span>
          </label>

          {/* Options for select types */}
          {needsOptions && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Options</label>
              <div className="space-y-1.5 mb-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className="h-4 w-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: opt.color || '#6b7280' }}
                    />
                    <span className="text-sm flex-1">{opt.label}</span>
                    <span className="text-xs text-gray-500 font-mono">{opt.value}</span>
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="text-gray-400 hover:text-red-500 text-sm"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newOptionLabel}
                  onChange={(e) => setNewOptionLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addOption()
                    }
                  }}
                  placeholder="Option label..."
                  className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button type="button" variant="secondary" size="sm" onClick={addOption}>
                  Add
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim()}
              isLoading={createField.isPending || updateField.isPending}
              onClick={handleSubmit}
            >
              {editing ? 'Save' : 'Add Field'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteField.mutate(deleteTarget.id, {
              onSuccess: () => setDeleteTarget(null),
            })
          }
        }}
        title="Delete Custom Field"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? All values for this field will be permanently removed from all issues.`}
        confirmLabel="Delete"
        destructive
        isLoading={deleteField.isPending}
      />
    </div>
  )
}
