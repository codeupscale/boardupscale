import { useRef, useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Issue, ProjectType, User } from '@/types'
import { useCreateIssue } from '@/hooks/useIssues'
import { useProjectMembers } from '@/hooks/useProjects'
import { uploadIssueAttachments } from '@/lib/upload-attachments'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { TicketModal, TicketModalBody } from './ticket-modal'
import { TicketModalHeader } from './ticket-modal-header'
import { TicketModalFooter } from './ticket-modal-footer'
import {
  IssueTicketForm,
  type IssueTicketFormHandle,
} from './issue-ticket-form'
import type {
  IssueTicketFormPayload,
  IssueTicketFormValues,
  StagedIssueLink,
} from './issue-ticket-form.schema'
import type { TicketStatusOption, TicketSprintOption } from './ticket-modal.types'
import { resolveCreateTicketDefaults, extractAttachmentIdsFromHtml } from './ticket-modal.utils'
import { isKanbanProject } from '@/lib/project-workflow'

export interface CreateIssueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectType?: ProjectType
  statuses?: TicketStatusOption[]
  sprints?: TicketSprintOption[]
  users?: User[]
  defaultValues?: Partial<IssueTicketFormValues>
  onSuccess?: (issue: Issue) => void
}

async function createStagedLinks(
  issueId: string,
  links: StagedIssueLink[],
): Promise<{ successCount: number; failedCount: number }> {
  let successCount = 0
  let failedCount = 0

  for (const link of links) {
    try {
      await api.post(`/issues/${issueId}/links`, {
        targetIssueId: link.targetIssueId,
        linkType: link.linkType,
      })
      successCount += 1
    } catch {
      failedCount += 1
    }
  }

  return { successCount, failedCount }
}

export function CreateIssueDialog({
  open,
  onOpenChange,
  projectId,
  projectType,
  statuses = [],
  sprints = [],
  defaultValues,
  onSuccess,
}: CreateIssueDialogProps) {
  const { t } = useTranslation()
  const formRef = useRef<IssueTicketFormHandle>(null)
  const createIssue = useCreateIssue()
  const { data: projectMembers = [] } = useProjectMembers(projectId)
  const projectUsers = projectMembers.map((member) => member.user)
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    if (open) setFormKey((k) => k + 1)
  }, [open])

  const [uploadingAttachments, setUploadingAttachments] = useState(false)
  const [linkingIssues, setLinkingIssues] = useState(false)

  const isBusy = createIssue.isPending || uploadingAttachments || linkingIssues

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        formRef.current?.requestClose()
        return
      }
      onOpenChange(true)
    },
    [onOpenChange],
  )

  const handleCancel = useCallback(() => {
    if (isBusy) return
    onOpenChange(false)
  }, [isBusy, onOpenChange])

  const handleSubmit = () => {
    const form = document.getElementById('issue-ticket-form') as HTMLFormElement | null
    form?.requestSubmit()
  }

  const handleFormSubmit = (
    payload: IssueTicketFormPayload,
    attachments: File[],
    stagedLinks: StagedIssueLink[],
    descriptionAttachmentIds: string[],
  ) => {
    const { labels, ...issuePayload } = payload

    createIssue.mutate(
      {
        title: issuePayload.title,
        type: issuePayload.type,
        priority: issuePayload.priority,
        projectId,
        projectType,
        labels,
        ...(issuePayload.description ? { description: issuePayload.description } : {}),
        ...(issuePayload.statusId ? { statusId: issuePayload.statusId } : {}),
        ...(issuePayload.assigneeId ? { assigneeId: issuePayload.assigneeId } : {}),
        ...(issuePayload.parentId ? { parentId: issuePayload.parentId } : {}),
        ...(issuePayload.sprintId ? { sprintId: issuePayload.sprintId } : {}),
        ...(issuePayload.dueDate ? { dueDate: issuePayload.dueDate } : {}),
      },
      {
        onSuccess: async (created) => {
          try {
            // Prefer linking files already uploaded during the modal (description +
            // attachment section). Fall back to uploading any leftover staged Files.
            const fromHtml = extractAttachmentIdsFromHtml(issuePayload.description)
            const toLink = [
              ...new Set([...(descriptionAttachmentIds || []), ...fromHtml]),
            ].filter(Boolean)

            if (toLink.length > 0) {
              setUploadingAttachments(true)
              try {
                await api.post('/files/link-to-issue', {
                  issueId: created.id,
                  attachmentIds: toLink,
                })
              } catch {
                toast(
                  t(
                    'issues.descriptionAttachmentsLinkFail',
                    'Ticket created, but some files could not be linked. Re-open the ticket to retry.',
                  ),
                  'error',
                )
              }
            }

            if (attachments.length > 0) {
              setUploadingAttachments(true)
              const result = await uploadIssueAttachments(attachments, {
                issueId: created.id,
                projectId,
              })
              if (result.failedCount > 0) {
                toast(
                  t('issues.attachmentsPartialFail', {
                    uploaded: result.uploadedCount,
                    total: attachments.length,
                    defaultValue:
                      'Ticket created. {{uploaded}}/{{total}} attachments uploaded. You can retry failed uploads from the ticket.',
                  }),
                  'error',
                )
              }
            }

            if (stagedLinks.length > 0) {
              setLinkingIssues(true)
              const linkResult = await createStagedLinks(created.id, stagedLinks)
              if (linkResult.failedCount > 0) {
                toast(
                  t('issues.linksPartialFail', {
                    success: linkResult.successCount,
                    total: stagedLinks.length,
                    defaultValue:
                      'Ticket created. {{success}}/{{total}} links created. You can add remaining links from the ticket.',
                  }),
                  'error',
                )
              }
            }
          } finally {
            setUploadingAttachments(false)
            setLinkingIssues(false)
          }

          onSuccess?.(created)
          onOpenChange(false)
        },
      },
    )
  }

  const resolvedDefaults = resolveCreateTicketDefaults(statuses, defaultValues)

  return (
    <TicketModal
      open={open}
      onOpenChange={handleOpenChange}
      preventClose={isBusy}
    >
      <TicketModalHeader
        title={t('issues.createIssue')}
        subtitle={t(
          'issues.createIssueSubtitle',
          'Provide details for the new work item',
        )}
      />

      <TicketModalBody>
        <IssueTicketForm
          key={formKey}
          ref={formRef}
          projectId={projectId}
          statuses={statuses}
          sprints={sprints}
          users={projectUsers}
          isKanban={isKanbanProject(projectType)}
          defaultValues={resolvedDefaults}
          onSubmit={handleFormSubmit}
          onCancel={handleCancel}
          disabled={isBusy}
        />
      </TicketModalBody>

      <TicketModalFooter
        onCancel={() => formRef.current?.requestClose()}
        onSubmit={handleSubmit}
        submitLabel={t('issues.createIssue')}
        isLoading={isBusy}
        showCreateIcon
      />
    </TicketModal>
  )
}

/** Re-export handle type for page consumers migrating from IssueFormHandle */
export type { IssueTicketFormHandle as CreateIssueFormHandle }
