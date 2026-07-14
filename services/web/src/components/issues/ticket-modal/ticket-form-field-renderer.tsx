import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { IssueType, User } from '@/types'
import { IssueTypeSelect } from '@/components/issues/issue-type-select'
import { ParentIssueSelect } from '@/components/issues/parent-issue-select'
import { UserSelect } from '@/components/common/user-select'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import {
  RICH_TEXT_ISSUE_CONTENT_MIN_HEIGHT,
  RICH_TEXT_ISSUE_EDITOR_MAX_HEIGHT,
} from '@/components/ui/rich-text-display'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { TicketFormField } from './ticket-form-layout'
import type { TicketStatusOption, TicketSprintOption } from './ticket-modal.types'
import { TicketStatusSelect } from './fields/ticket-status-select'
import { TicketPrioritySelect } from './fields/ticket-priority-select'
import { TicketLabelsField } from './fields/ticket-labels-field'
import { TicketSprintSelect } from './fields/ticket-sprint-select'
import { TicketReporterField } from './fields/ticket-reporter-field'
import { TicketAttachmentField } from './fields/ticket-attachment-field'
import { TicketLinkedItemField } from './fields/ticket-linked-item-field'
import type { TicketFieldConfig, TicketFormMode } from './issue-ticket-form.config'
import type { IssueTicketFormValues } from './issue-ticket-form.schema'
import type { IssueTicketFormState } from './use-issue-ticket-form'
import { TOP_LEVEL_ISSUE_TYPES } from './ticket-modal.constants'
import { ticketModalFieldControl } from './ticket-modal.utils'

export interface TicketFormFieldRendererProps {
  field: TicketFieldConfig
  mode: TicketFormMode
  issueId?: string
  projectId: string
  control: Control<IssueTicketFormValues>
  register: UseFormRegister<IssueTicketFormValues>
  errors: FieldErrors<IssueTicketFormValues>
  setValue: (name: keyof IssueTicketFormValues, value: string) => void
  watch: (name: keyof IssueTicketFormValues) => string | undefined
  watchedType: IssueType | string
  statuses: TicketStatusOption[]
  sprints: TicketSprintOption[]
  users: User[]
  reporter?: User | null
  excludeParentIds?: string[]
  localState: IssueTicketFormState['localState']
  disabled?: boolean
}

export function TicketFormFieldRenderer({
  field,
  mode,
  issueId,
  projectId,
  control,
  register,
  errors,
  setValue,
  watch,
  watchedType,
  statuses,
  sprints,
  users,
  reporter,
  excludeParentIds = [],
  localState,
  disabled,
}: TicketFormFieldRendererProps) {
  const { t } = useTranslation()
  const label = t(field.labelKey)

  switch (field.type) {
    case 'type':
      return (
        <Controller
          name="type"
          control={control}
          render={({ field: f }) => (
            <IssueTypeSelect
              label={label}
              value={f.value}
              onChange={(val) => f.onChange(val)}
              required={field.required}
              disabled={disabled}
              options={mode === 'create' ? [...TOP_LEVEL_ISSUE_TYPES] : undefined}
            />
          )}
        />
      )

    case 'status':
      return (
        <Controller
          name="statusId"
          control={control}
          render={({ field: f }) => (
            <TicketStatusSelect
              label={label}
              value={f.value}
              onChange={f.onChange}
              statuses={statuses}
              disabled={disabled}
              error={errors.statusId?.message}
            />
          )}
        />
      )

    case 'title':
      return (
        <TicketFormField
          label={label}
          required={field.required}
          error={errors.title?.message}
        >
          <Input
            placeholder={t('issues.summaryTitlePlaceholder', 'Add a concise title for the ticket...')}
            className={ticketModalFieldControl('h-11 text-base shadow-none')}
            disabled={disabled}
            {...register('title')}
          />
        </TicketFormField>
      )

    case 'description':
      return (
        <TicketFormField label={label}>
          <RichTextEditor
            value={watch('description') || ''}
            onChange={(val) => setValue('description', val)}
            placeholder={t('issues.describeIssue')}
            users={users}
            minHeight={RICH_TEXT_ISSUE_CONTENT_MIN_HEIGHT}
            maxHeight={RICH_TEXT_ISSUE_EDITOR_MAX_HEIGHT}
            projectId={projectId}
            issueId={issueId}
          />
        </TicketFormField>
      )

    case 'assignee':
      return (
        <Controller
          name="assigneeId"
          control={control}
          render={({ field: f }) => (
            <TicketFormField label={label}>
              <UserSelect
                value={f.value || null}
                onChange={(id) => f.onChange(id ?? '')}
                placeholder={t('issues.unassigned')}
                projectId={projectId}
                className={ticketModalFieldControl()}
              />
            </TicketFormField>
          )}
        />
      )

    case 'labels':
      return (
        <TicketLabelsField
          label={label}
          labels={localState.labels}
          onAdd={localState.addLabel}
          onRemove={localState.removeLabel}
          disabled={disabled}
        />
      )

    case 'priority':
      return (
        <Controller
          name="priority"
          control={control}
          render={({ field: f }) => (
            <TicketPrioritySelect
              label={label}
              value={f.value}
              onChange={f.onChange}
              disabled={disabled}
              error={errors.priority?.message}
            />
          )}
        />
      )

    case 'sprint':
      return (
        <Controller
          name="sprintId"
          control={control}
          render={({ field: f }) => (
            <TicketSprintSelect
              label={label}
              value={f.value}
              onChange={f.onChange}
              sprints={sprints}
              disabled={disabled}
              error={errors.sprintId?.message}
            />
          )}
        />
      )

    case 'parent':
      return (
        <Controller
          name="parentId"
          control={control}
          render={({ field: f }) => (
            <TicketFormField label={label}>
              <ParentIssueSelect
                projectId={projectId}
                childType={watchedType as IssueType}
                value={f.value ?? null}
                onChange={(v) => f.onChange(v ?? '')}
                disabled={disabled}
                excludeIds={excludeParentIds}
                className={ticketModalFieldControl()}
              />
            </TicketFormField>
          )}
        />
      )

    case 'dueDate':
      return (
        <Controller
          name="dueDate"
          control={control}
          render={({ field: f }) => (
            <TicketFormField label={label}>
              <DatePicker
                value={f.value || undefined}
                onChange={(date) => f.onChange(date || '')}
                placeholder={t('issues.selectDueDate', 'Select due date')}
                disabled={disabled}
                triggerClassName={ticketModalFieldControl('rounded-lg focus-visible:ring-2')}
              />
            </TicketFormField>
          )}
        />
      )

    case 'reporter':
      return <TicketReporterField label={label} reporter={reporter} />

    case 'attachments':
      return (
        <TicketAttachmentField
          label={label}
          issueId={issueId}
          files={localState.attachments}
          onAdd={localState.addAttachment}
          onRemove={localState.removeAttachment}
          disabled={disabled}
        />
      )

    case 'linkedItem':
      return (
        <TicketLinkedItemField
          label={label}
          mode={mode}
          issueId={issueId}
          projectId={projectId}
          stagedLinks={localState.stagedLinks}
          onAdd={localState.addStagedLink}
          onRemove={localState.removeStagedLink}
          disabled={disabled}
        />
      )

    default:
      return null
  }
}
