import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { User } from '@/types'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { cn } from '@/lib/utils'
import { useIssueTicketForm } from './use-issue-ticket-form'
import { getVisibleFormRows, type TicketFormMode } from './issue-ticket-form.config'
import { TicketFormRow } from './ticket-form-layout'
import { TicketFormFieldRenderer } from './ticket-form-field-renderer'
import { ticketModalTokens } from './ticket-modal.tokens'
import type { IssueTicketFormValues, IssueTicketFormPayload, StagedIssueLink } from './issue-ticket-form.schema'
import type { TicketStatusOption, TicketSprintOption } from './ticket-modal.types'

export interface IssueTicketFormHandle {
  requestClose: () => void
}

export interface IssueTicketFormProps {
  mode?: TicketFormMode
  issueId?: string
  projectId: string
  statuses?: TicketStatusOption[]
  sprints?: TicketSprintOption[]
  users?: User[]
  isKanban?: boolean
  defaultValues?: Partial<IssueTicketFormValues>
  initialLabels?: string[]
  reporter?: User | null
  excludeParentIds?: string[]
  onSubmit: (
    payload: IssueTicketFormPayload,
    attachments: File[],
    stagedLinks: StagedIssueLink[],
  ) => void
  onCancel: () => void
  disabled?: boolean
}

export const IssueTicketForm = forwardRef<IssueTicketFormHandle, IssueTicketFormProps>(
  function IssueTicketForm(
    {
      mode = 'create',
      issueId,
      projectId,
      statuses = [],
      sprints = [],
      users = [],
      isKanban = false,
      defaultValues,
      initialLabels = [],
      reporter,
      excludeParentIds = [],
      onSubmit,
      onCancel,
      disabled = false,
    },
    ref,
  ) {
    const { t } = useTranslation()
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

    const {
      register,
      handleSubmit,
      control,
      setValue,
      watch,
      errors,
      isFormDirty,
      watchedType,
      buildPayload,
      localState,
    } = useIssueTicketForm({ defaultValues, initialLabels })

    const formContext = useMemo(
      () => ({
        mode,
        watchedType,
        statusesCount: statuses.length,
        isKanban,
      }),
      [mode, watchedType, statuses.length, isKanban],
    )

    const rows = useMemo(
      () => getVisibleFormRows(formContext),
      [formContext],
    )

    const handleCancel = () => {
      if (isFormDirty) {
        setShowDiscardConfirm(true)
      } else {
        onCancel()
      }
    }

    useImperativeHandle(ref, () => ({ requestClose: handleCancel }))

    const handleFormSubmit = (values: IssueTicketFormValues) => {
      onSubmit(buildPayload(values), localState.attachments, localState.stagedLinks)
    }

    return (
      <>
        <form
          id="issue-ticket-form"
          onSubmit={handleSubmit(handleFormSubmit)}
          className={cn(ticketModalTokens.formGap, disabled && 'pointer-events-none opacity-60')}
          aria-busy={disabled}
        >
          {rows.map((row) => (
              <TicketFormRow key={row.id}>
                {row.fields.map((fieldConfig) => (
                  <div
                    key={fieldConfig.id}
                    className={cn(
                      fieldConfig.grid === 'full' && 'sm:col-span-2',
                      fieldConfig.grid === 'half' &&
                        fieldConfig.column === 'right' &&
                        'sm:col-start-2',
                    )}
                  >
                    <TicketFormFieldRenderer
                      field={fieldConfig}
                      mode={mode}
                      issueId={issueId}
                      projectId={projectId}
                      control={control}
                      register={register}
                      errors={errors}
                      setValue={setValue}
                      watch={watch}
                      watchedType={watchedType}
                      statuses={statuses}
                      sprints={sprints}
                      users={users}
                      reporter={reporter}
                      excludeParentIds={excludeParentIds}
                      localState={localState}
                      disabled={disabled}
                    />
                  </div>
                ))}
              </TicketFormRow>
          ))}
        </form>

        <ConfirmDialog
          open={showDiscardConfirm}
          onClose={() => setShowDiscardConfirm(false)}
          onConfirm={() => {
            setShowDiscardConfirm(false)
            onCancel()
          }}
          title={t('issues.discardChanges', 'Discard changes?')}
          description={t(
            'issues.discardChangesDescription',
            'You have unsaved changes. Are you sure you want to discard them?',
          )}
          confirmLabel={t('issues.discard', 'Discard')}
          cancelLabel={t('issues.goBack', 'Go Back')}
          destructive
        />
      </>
    )
  },
)
