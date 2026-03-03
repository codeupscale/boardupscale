import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { X } from 'lucide-react'
import { IssueType, IssuePriority, Issue } from '@/types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { UserSelect } from '@/components/common/user-select'

const schema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().optional(),
  type: z.nativeEnum(IssueType),
  priority: z.nativeEnum(IssuePriority),
  statusId: z.string().optional(),
  assigneeId: z.string().optional(),
  sprintId: z.string().optional(),
  parentId: z.string().optional(),
  dueDate: z.string().optional(),
  storyPoints: z.coerce.number().min(0).max(100).optional().nullable(),
  timeEstimate: z.coerce.number().min(0).optional().nullable(),
})

type FormValues = z.infer<typeof schema>

interface IssueFormProps {
  projectId: string
  statuses?: Array<{ id: string; name: string }>
  sprints?: Array<{ id: string; name: string }>
  defaultValues?: Partial<FormValues>
  onSubmit: (values: FormValues) => void
  onCancel: () => void
  isLoading?: boolean
  submitLabel?: string
}

export function IssueForm({
  projectId,
  statuses = [],
  sprints = [],
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
  submitLabel = 'Create Issue',
}: IssueFormProps) {
  const [labels, setLabels] = useState<string[]>([])
  const [labelInput, setLabelInput] = useState('')

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: IssueType.TASK,
      priority: IssuePriority.MEDIUM,
      ...defaultValues,
    },
  })

  const addLabel = () => {
    const trimmed = labelInput.trim()
    if (trimmed && !labels.includes(trimmed)) {
      setLabels([...labels, trimmed])
      setLabelInput('')
    }
  }

  const removeLabel = (l: string) => setLabels(labels.filter((x) => x !== l))

  const handleFormSubmit = (values: FormValues) => {
    onSubmit({ ...values, labels } as any)
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <Input
        label="Title"
        placeholder="Issue title"
        error={errors.title?.message}
        {...register('title')}
      />

      <Textarea
        label="Description"
        placeholder="Describe the issue..."
        rows={4}
        {...register('description')}
      />

      <div className="grid grid-cols-2 gap-4">
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <Select
              label="Type"
              options={[
                { value: IssueType.EPIC, label: 'Epic' },
                { value: IssueType.STORY, label: 'Story' },
                { value: IssueType.TASK, label: 'Task' },
                { value: IssueType.BUG, label: 'Bug' },
                { value: IssueType.SUBTASK, label: 'Subtask' },
              ]}
              {...field}
            />
          )}
        />

        <Controller
          name="priority"
          control={control}
          render={({ field }) => (
            <Select
              label="Priority"
              options={[
                { value: IssuePriority.CRITICAL, label: 'Critical' },
                { value: IssuePriority.HIGH, label: 'High' },
                { value: IssuePriority.MEDIUM, label: 'Medium' },
                { value: IssuePriority.LOW, label: 'Low' },
                { value: IssuePriority.NONE, label: 'None' },
              ]}
              {...field}
            />
          )}
        />
      </div>

      {statuses.length > 0 && (
        <Controller
          name="statusId"
          control={control}
          render={({ field }) => (
            <Select
              label="Status"
              placeholder="Select status..."
              options={statuses.map((s) => ({ value: s.id, label: s.name }))}
              {...field}
            />
          )}
        />
      )}

      <Controller
        name="assigneeId"
        control={control}
        render={({ field }) => (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assignee</label>
            <UserSelect
              value={field.value || null}
              onChange={(id) => field.onChange(id)}
              placeholder="Unassigned"
            />
          </div>
        )}
      />

      {sprints.length > 0 && (
        <Controller
          name="sprintId"
          control={control}
          render={({ field }) => (
            <Select
              label="Sprint"
              placeholder="No sprint"
              options={sprints.map((s) => ({ value: s.id, label: s.name }))}
              {...field}
            />
          )}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Due Date"
          type="date"
          {...register('dueDate')}
        />
        <Input
          label="Story Points"
          type="number"
          min="0"
          max="100"
          placeholder="0"
          {...register('storyPoints')}
        />
      </div>

      <Input
        label="Time Estimate (minutes)"
        type="number"
        min="0"
        placeholder="e.g. 120"
        {...register('timeEstimate')}
      />

      {/* Labels */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Labels</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {labels.map((l) => (
            <span
              key={l}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs"
            >
              {l}
              <button
                type="button"
                onClick={() => removeLabel(l)}
                className="hover:text-blue-900"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addLabel()
              }
            }}
            placeholder="Add label and press Enter"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button type="button" variant="secondary" size="sm" onClick={addLabel}>
            Add
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
