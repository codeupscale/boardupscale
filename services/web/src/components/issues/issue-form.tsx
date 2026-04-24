import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useMemo, useImperativeHandle, forwardRef } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { IssueType, IssuePriority, Issue, CustomFieldDefinition, ProjectComponent, ProjectVersion, User } from '@/types'
import { IssueTypeSelect } from '@/components/issues/issue-type-select'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { UserSelect } from '@/components/common/user-select'
import { CustomFieldsForm } from '@/components/issues/custom-fields-form'
import { AiSuggestionsPanel } from '@/components/issues/ai-suggestions-panel'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { DatePicker } from '@/components/ui/date-picker'
import { ConfirmDialog } from '@/components/common/confirm-dialog'

/** Issue types that may serve as a parent, indexed by the prospective child's type. */
const VALID_PARENT_TYPES: Record<string, string[]> = {
  story: ['epic'],
  task: ['epic', 'story'],
  bug: ['epic', 'story'],
  subtask: ['epic', 'story', 'task', 'bug'],
}

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
  /** Candidate parent issues for the current project — filtered by hierarchy rules in the UI. */
  parentIssues?: Array<{ id: string; key: string; title: string; type: string }>
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

export interface IssueFormHandle {
  /** Call this from the Dialog's onClose to respect dirty-state confirmation */
  requestClose: () => void
}

export const IssueForm = forwardRef<IssueFormHandle, IssueFormProps>(function IssueForm({
  projectId,
  statuses = [],
  sprints = [],
  parentIssues = [],
  customFieldDefs = [],
  components = [],
  versions = [],
  users = [],
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
  submitLabel,
}: IssueFormProps, ref) {
  const { t } = useTranslation()
  const [labels, setLabels] = useState<string[]>([])
  const [labelInput, setLabelInput] = useState('')
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({})
  const [selectedComponents, setSelectedComponents] = useState<string[]>([])
  const [selectedFixVersions, setSelectedFixVersions] = useState<string[]>([])
  const [parentSearch, setParentSearch] = useState('')

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: IssueType.TASK,
      priority: IssuePriority.MEDIUM,
      ...defaultValues,
    },
  })

  const handleCancel = () => {
    const hasAnyInput = isDirty || labels.length > 0
    if (hasAnyInput) {
      setShowDiscardConfirm(true)
    } else {
      onCancel()
    }
  }

  useImperativeHandle(ref, () => ({ requestClose: handleCancel }))

  // Watch title for duplicate detection
  const watchedTitle = useWatch({ control, name: 'title' }) || ''
  const watchedType = useWatch({ control, name: 'type' }) || IssueType.TASK

  // Parent issues eligible for the currently selected child type
  const eligibleParents = useMemo(() => {
    const validTypes = VALID_PARENT_TYPES[watchedType.toLowerCase()] ?? []
    const needle = parentSearch.toLowerCase()
    return parentIssues.filter(
      (p) =>
        validTypes.includes(p.type.toLowerCase()) &&
        (needle === '' ||
          p.title.toLowerCase().includes(needle) ||
          p.key.toLowerCase().includes(needle)),
    )
  }, [parentIssues, watchedType, parentSearch])

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
        required
        {...register('title')}
      />

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
        <label className="block text-sm font-medium text-foreground/80 mb-1">
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
            <IssueTypeSelect
              label={t('common.type')}
              value={field.value}
              onChange={(val) => field.onChange(val)}
              required
            />
          )}
        />

        <Controller
          name="priority"
          control={control}
          render={({ field }) => (
            <div className="w-full">
              <Label className="mb-1">{t('common.priority')}</Label>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={IssuePriority.CRITICAL}>{t('priorities.critical')}</SelectItem>
                  <SelectItem value={IssuePriority.HIGH}>{t('priorities.high')}</SelectItem>
                  <SelectItem value={IssuePriority.MEDIUM}>{t('priorities.medium')}</SelectItem>
                  <SelectItem value={IssuePriority.LOW}>{t('priorities.low')}</SelectItem>
                  <SelectItem value={IssuePriority.NONE}>{t('priorities.none')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        />
      </div>

      {statuses.length > 0 && (
        <Controller
          name="statusId"
          control={control}
          render={({ field }) => (
            <div className="w-full">
              <Label className="mb-1">{t('common.status')}</Label>
              <Select value={field.value || ''} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.status') + '...'} />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        />
      )}

      <Controller
        name="assigneeId"
        control={control}
        render={({ field }) => (
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">{t('common.assignee')}</label>
            <UserSelect
              value={field.value || null}
              onChange={(id) => field.onChange(id)}
              placeholder={t('issues.unassigned')}
              projectId={projectId}
            />
          </div>
        )}
      />

      {/* Parent Issue — only shown when the selected type can have a parent */}
      {VALID_PARENT_TYPES[watchedType?.toLowerCase() ?? ''] && (
        <Controller
          name="parentId"
          control={control}
          render={({ field }) => (
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Parent Issue
              </label>
              <Input
                type="text"
                value={parentSearch}
                onChange={(e) => setParentSearch(e.target.value)}
                placeholder="Search by key or title…"
                className="mb-1"
              />
              <Select
                value={field.value || '__none__'}
                onValueChange={(v) => field.onChange(v === '__none__' ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— No parent —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No parent —</SelectItem>
                  {eligibleParents.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      [{p.key}] {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {parentIssues.length > 0 && eligibleParents.length === 0 && parentSearch === '' && (
                <p className="text-xs text-muted-foreground mt-1">
                  No eligible parents for a {watchedType} in this project.
                </p>
              )}
            </div>
          )}
        />
      )}

      {sprints.length > 0 && (
        <Controller
          name="sprintId"
          control={control}
          render={({ field }) => (
            <div className="w-full">
              <Label className="mb-1">{t('issues.sprint')}</Label>
              <Select value={field.value || ''} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.noSprint')} />
                </SelectTrigger>
                <SelectContent>
                  {sprints.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <Controller
          name="dueDate"
          control={control}
          render={({ field }) => (
            <DatePicker
              label={t('issues.dueDate')}
              value={field.value || undefined}
              onChange={(date) => field.onChange(date || '')}
              placeholder="Pick a date"
            />
          )}
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
        <label className="block text-sm font-medium text-foreground/80 mb-1">{t('issues.labels')}</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {labels.map((l) => (
            <span
              key={l}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs"
            >
              {l}
              <button
                type="button"
                onClick={() => removeLabel(l)}
                className="hover:text-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
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
            className="flex-1"
          />
          <Button type="button" variant="secondary" size="sm" onClick={addLabel}>
            {t('common.add')}
          </Button>
        </div>
      </div>

      {/* Components */}
      {components.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">Components</label>
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
          <Select
            value="__none__"
            onValueChange={(v) => {
              if (v !== '__none__' && !selectedComponents.includes(v)) {
                setSelectedComponents([...selectedComponents, v])
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Add component..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Add component...</SelectItem>
              {components
                .filter((c) => !selectedComponents.includes(c.id))
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Fix Version */}
      {versions.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">Fix Version</label>
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
          <Select
            value="__none__"
            onValueChange={(v) => {
              if (v !== '__none__' && !selectedFixVersions.includes(v)) {
                setSelectedFixVersions([...selectedFixVersions, v])
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Add version..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Add version...</SelectItem>
              {versions
                .filter((v) => v.status !== 'archived' && !selectedFixVersions.includes(v.id))
                .map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Custom Fields */}
      {customFieldDefs.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-2">Custom Fields</label>
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
            projectId={projectId}
          />
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={handleCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {submitLabel || t('issues.createIssue')}
        </Button>
      </div>

      <ConfirmDialog
        open={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={() => {
          setShowDiscardConfirm(false)
          onCancel()
        }}
        title={t('issues.discardChanges', 'Discard changes?')}
        description={t('issues.discardChangesDescription', 'You have unsaved changes. Are you sure you want to discard them?')}
        confirmLabel={t('issues.discard', 'Discard')}
        cancelLabel={t('issues.goBack', 'Go Back')}
        destructive
      />
    </form>
  )
})
