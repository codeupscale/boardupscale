import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { IssueType, IssuePriority, Issue, CustomFieldDefinition, ProjectComponent, ProjectVersion, User } from '@/types'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { UserSelect } from '@/components/common/user-select'
import { CustomFieldsForm } from '@/components/issues/custom-fields-form'
import { SimilarIssuesPanel } from '@/components/issues/similar-issues-panel'
import { AiSuggestionsPanel } from '@/components/issues/ai-suggestions-panel'
import { RichTextEditor } from '@/components/ui/rich-text-editor'

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
  customFieldDefs?: CustomFieldDefinition[]
  components?: ProjectComponent[]
  versions?: ProjectVersion[]
  users?: User[]
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
  customFieldDefs = [],
  components = [],
  versions = [],
  users = [],
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
  submitLabel,
}: IssueFormProps) {
  const { t } = useTranslation()
  const [labels, setLabels] = useState<string[]>([])
  const [labelInput, setLabelInput] = useState('')
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({})
  const [selectedComponents, setSelectedComponents] = useState<string[]>([])
  const [selectedFixVersions, setSelectedFixVersions] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: IssueType.TASK,
      priority: IssuePriority.MEDIUM,
      ...defaultValues,
    },
  })

  // Watch title for duplicate detection
  const watchedTitle = useWatch({ control, name: 'title' }) || ''

  const addLabel = () => {
    const trimmed = labelInput.trim()
    if (trimmed && !labels.includes(trimmed)) {
      setLabels([...labels, trimmed])
      setLabelInput('')
    }
  }

  const removeLabel = (l: string) => setLabels(labels.filter((x) => x !== l))

  const handleFormSubmit = (values: FormValues) => {
    // Strip empty strings from optional fields so the backend
    // doesn't reject them as invalid UUIDs / dates / etc.
    const cleaned = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== '' && v !== null && v !== undefined),
    )
    onSubmit({
      ...cleaned,
      labels,
      customFieldValues: Object.entries(customFieldValues)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([fieldId, value]) => ({ fieldId, value })),
      componentIds: selectedComponents.length > 0 ? selectedComponents : undefined,
      fixVersionIds: selectedFixVersions.length > 0 ? selectedFixVersions : undefined,
    } as any)
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <Input
        label={t('common.title')}
        placeholder={t('issues.issueTitle')}
        error={errors.title?.message}
        {...register('title')}
      />

      {/* Duplicate Detection */}
      <SimilarIssuesPanel title={watchedTitle} projectId={projectId} />

      {/* AI Suggestions */}
      <AiSuggestionsPanel
        title={watchedTitle}
        projectId={projectId}
        onApplyType={(type) => setValue('type', type as IssueType)}
        onApplyPriority={(priority) => setValue('priority', priority as IssuePriority)}
        onApplyTitle={(title) => setValue('title', title)}
        onApplyAssignee={(userId) => setValue('assigneeId', userId)}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('common.description')}
        </label>
        <RichTextEditor
          value={watch('description') || ''}
          onChange={(val) => setValue('description', val)}
          placeholder={t('issues.describeIssue')}
          users={users}
          minHeight={100}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <Select
              label={t('common.type')}
              options={[
                { value: IssueType.EPIC, label: t('issues.epic') },
                { value: IssueType.STORY, label: t('issues.story') },
                { value: IssueType.TASK, label: t('issues.task') },
                { value: IssueType.BUG, label: t('issues.bug') },
                { value: IssueType.SUBTASK, label: t('issues.subtask') },
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
              label={t('common.priority')}
              options={[
                { value: IssuePriority.CRITICAL, label: t('priorities.critical') },
                { value: IssuePriority.HIGH, label: t('priorities.high') },
                { value: IssuePriority.MEDIUM, label: t('priorities.medium') },
                { value: IssuePriority.LOW, label: t('priorities.low') },
                { value: IssuePriority.NONE, label: t('priorities.none') },
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
              label={t('common.status')}
              placeholder={t('common.status') + '...'}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.assignee')}</label>
            <UserSelect
              value={field.value || null}
              onChange={(id) => field.onChange(id)}
              placeholder={t('issues.unassigned')}
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
              label={t('issues.sprint')}
              placeholder={t('common.noSprint')}
              options={sprints.map((s) => ({ value: s.id, label: s.name }))}
              {...field}
            />
          )}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <Input
          label={t('issues.dueDate')}
          type="date"
          {...register('dueDate')}
        />
        <Input
          label={t('issues.storyPoints')}
          type="number"
          min="0"
          max="100"
          placeholder="0"
          {...register('storyPoints')}
        />
      </div>

      <Input
        label={t('issues.timeEstimateMinutes')}
        type="number"
        min="0"
        placeholder="e.g. 120"
        {...register('timeEstimate')}
      />

      {/* Labels */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('issues.labels')}</label>
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
            placeholder={t('issues.addLabelEnter')}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button type="button" variant="secondary" size="sm" onClick={addLabel}>
            {t('common.add')}
          </Button>
        </div>
      </div>

      {/* Components */}
      {components.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Components</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedComponents.map((cId) => {
              const comp = components.find((c) => c.id === cId)
              return (
                <span
                  key={cId}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs"
                >
                  {comp?.name || cId}
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedComponents(selectedComponents.filter((id) => id !== cId))
                    }
                    className="hover:text-purple-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )
            })}
          </div>
          <select
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value=""
            onChange={(e) => {
              if (e.target.value && !selectedComponents.includes(e.target.value)) {
                setSelectedComponents([...selectedComponents, e.target.value])
              }
            }}
          >
            <option value="">Add component...</option>
            {components
              .filter((c) => !selectedComponents.includes(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
      )}

      {/* Fix Version */}
      {versions.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fix Version</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedFixVersions.map((vId) => {
              const ver = versions.find((v) => v.id === vId)
              return (
                <span
                  key={vId}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs"
                >
                  {ver?.name || vId}
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedFixVersions(selectedFixVersions.filter((id) => id !== vId))
                    }
                    className="hover:text-green-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )
            })}
          </div>
          <select
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value=""
            onChange={(e) => {
              if (e.target.value && !selectedFixVersions.includes(e.target.value)) {
                setSelectedFixVersions([...selectedFixVersions, e.target.value])
              }
            }}
          >
            <option value="">Add version...</option>
            {versions
              .filter((v) => v.status !== 'archived' && !selectedFixVersions.includes(v.id))
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
        </div>
      )}

      {/* Custom Fields */}
      {customFieldDefs.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Custom Fields</label>
          <CustomFieldsForm
            definitions={customFieldDefs}
            values={Object.entries(customFieldValues).map(([fieldId, value]) => ({
              id: fieldId,
              issueId: '',
              fieldId,
              value,
              createdAt: '',
              updatedAt: '',
            }))}
            onChange={(fieldId, value) =>
              setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }))
            }
          />
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {submitLabel || t('issues.createIssue')}
        </Button>
      </div>
    </form>
  )
}
