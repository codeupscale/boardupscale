import { useRef, useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useIssue, useUpdateIssue, useDeleteIssue } from '@/hooks/useIssues'
import { useProject, useProjectMembers } from '@/hooks/useProjects'
import { useBoard } from '@/hooks/useBoard'
import { useSprints } from '@/hooks/useSprints'
import { useHasPermission } from '@/hooks/useHasPermission'
import { uploadIssueAttachments } from '@/lib/upload-attachments'
import { getSocket } from '@/lib/socket'
import { isKanbanProject } from '@/lib/project-workflow'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ListSkeleton } from '@/components/ui/skeleton'
import { TicketModal, TicketModalBody } from './ticket-modal'
import { TicketModalHeader } from './ticket-modal-header'
import { TicketModalFooter } from './ticket-modal-footer'
import {
  IssueTicketForm,
  type IssueTicketFormHandle,
} from './issue-ticket-form'
import { TicketActivityTabs } from './ticket-activity-tabs'
import type {
  IssueTicketFormPayload,
  IssueTicketFormValues,
  StagedIssueLink,
} from './issue-ticket-form.schema'
import {
  mapTicketStatuses,
  issueToTicketFormValues,
} from './ticket-modal.utils'

export interface EditIssueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  issueId: string
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

export function EditIssueDialog({
  open,
  onOpenChange,
  issueId,
}: EditIssueDialogProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const formRef = useRef<IssueTicketFormHandle>(null)
  const updateIssue = useUpdateIssue()
  const deleteIssue = useDeleteIssue()
  const [formKey, setFormKey] = useState(0)
  const [uploadingAttachments, setUploadingAttachments] = useState(false)
  const [linkingIssues, setLinkingIssues] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const { data: issue, isLoading, isError } = useIssue(issueId)
  const projectRef = issue?.project?.key || issue?.projectId || ''
  const { data: project } = useProject(projectRef)
  const isKanban = isKanbanProject(project?.type)
  const { data: board } = useBoard(issue?.projectId || '')
  const { data: sprints } = useSprints(issue?.projectId || '', {
    enabled: !!issue?.projectId && !!project && !isKanban,
  })
  const { data: projectMembers = [] } = useProjectMembers(issue?.projectId || '')
  const projectUsers = projectMembers.map((member) => member.user)
  const { hasPermission } = useHasPermission(issue?.projectId)
  const canEdit = hasPermission('issue', 'update')
  const canDelete = hasPermission('issue', 'delete')
  const canModifyAnyComment = hasPermission('comment', 'update:any')

  const isBusy =
    updateIssue.isPending ||
    deleteIssue.isPending ||
    uploadingAttachments ||
    linkingIssues

  useEffect(() => {
    if (open) setFormKey((k) => k + 1)
  }, [open, issueId])

  useEffect(() => {
    if (!open) return
    const socket = getSocket()

    const handleIssueUpdated = (updated: { id: string }) => {
      if (updated?.id !== issueId) return
      qc.invalidateQueries({ queryKey: ['issue', issueId] })
      qc.invalidateQueries({ queryKey: ['activities', issueId] })
    }

    const handleCommentEvent = (data: { issueId: string }) => {
      if (data?.issueId !== issueId) return
      qc.invalidateQueries({ queryKey: ['comments', issueId] })
      qc.invalidateQueries({ queryKey: ['activities', issueId] })
    }

    const handleAttachmentEvent = (data: { issueId: string }) => {
      if (data?.issueId !== issueId) return
      qc.invalidateQueries({ queryKey: ['attachments', issueId] })
      qc.invalidateQueries({ queryKey: ['activities', issueId] })
    }

    socket.on('issue:updated', handleIssueUpdated)
    socket.on('comment:created', handleCommentEvent)
    socket.on('comment:updated', handleCommentEvent)
    socket.on('comment:deleted', handleCommentEvent)
    socket.on('attachment:created', handleAttachmentEvent)
    socket.on('attachment:deleted', handleAttachmentEvent)

    return () => {
      socket.off('issue:updated', handleIssueUpdated)
      socket.off('comment:created', handleCommentEvent)
      socket.off('comment:updated', handleCommentEvent)
      socket.off('comment:deleted', handleCommentEvent)
      socket.off('attachment:created', handleAttachmentEvent)
      socket.off('attachment:deleted', handleAttachmentEvent)
    }
  }, [open, issueId, qc])

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

  const handleDeleteConfirm = useCallback(() => {
    if (!issue || !canDelete) return

    deleteIssue.mutate(
      { id: issue.id, projectId: issue.projectId },
      {
        onSuccess: () => {
          setShowDeleteConfirm(false)
          onOpenChange(false)
        },
      },
    )
  }, [issue, canDelete, deleteIssue, onOpenChange])

  const handleSubmit = () => {
    const form = document.getElementById('issue-ticket-form') as HTMLFormElement | null
    form?.requestSubmit()
  }

  const handleFormSubmit = (
    payload: IssueTicketFormPayload,
    attachments: File[],
    stagedLinks: StagedIssueLink[],
    _descriptionAttachmentIds: string[],
  ) => {
    if (!issue || !canEdit) return

    const { labels, ...issuePayload } = payload

    // Build a minimal PATCH payload (only changed fields).
    // This prevents accidental clears when a field wasn't edited.
    const next = {
      title: issuePayload.title,
      description: issuePayload.description ?? '',
      type: issuePayload.type,
      priority: issuePayload.priority,
      labels,
      statusId: issuePayload.statusId ?? '',
      assigneeId: issuePayload.assigneeId ?? '',
      parentId: issuePayload.parentId ?? '',
      sprintId: issuePayload.sprintId ?? '',
      dueDate: issuePayload.dueDate ?? '',
    }

    const current = {
      title: issue.title,
      description: issue.description ?? '',
      type: issue.type,
      priority: issue.priority,
      labels: issue.labels ?? [],
      statusId: issue.statusId ?? '',
      assigneeId: issue.assigneeId ?? '',
      parentId: issue.parentId ?? '',
      sprintId: issue.sprintId ?? '',
      dueDate: issue.dueDate ?? '',
    }

    const patch: {
      id: string
      title?: string
      description?: string
      type?: string
      priority?: string
      labels?: string[]
      statusId?: string
      assigneeId?: string | null
      parentId?: string | null
      sprintId?: string | null
      dueDate?: string | null
    } = { id: issue.id }

    if (next.title !== current.title) patch.title = next.title
    if (next.description !== current.description) patch.description = next.description
    if (next.type !== current.type) patch.type = next.type
    if (next.priority !== current.priority) patch.priority = next.priority
    if (JSON.stringify(next.labels) !== JSON.stringify(current.labels)) patch.labels = next.labels
    if (next.statusId !== current.statusId) patch.statusId = next.statusId || undefined
    if (next.assigneeId !== current.assigneeId) patch.assigneeId = next.assigneeId || null
    if (next.parentId !== current.parentId) patch.parentId = next.parentId || null
    if (next.sprintId !== current.sprintId) patch.sprintId = next.sprintId || null
    if (next.dueDate !== current.dueDate) patch.dueDate = next.dueDate || null

    const hasFieldChanges = Object.keys(patch).length > 1

    // Attachments uploaded via AttachmentPanel and images inserted via RichTextEditor
    // are saved immediately (they do not require a PATCH). If there's nothing to
    // PATCH and no staged link work, treat Save as a close.
    if (!hasFieldChanges && attachments.length === 0 && stagedLinks.length === 0) {
      onOpenChange(false)
      return
    }

    updateIssue.mutate(
      patch,
      {
        onSuccess: async () => {
          try {
            if (attachments.length > 0) {
              setUploadingAttachments(true)
              const result = await uploadIssueAttachments(attachments, {
                issueId: issue.id,
                projectId: issue.projectId,
              })
              if (result.failedCount > 0) {
                toast(
                  t('issues.attachmentsPartialFailEdit', {
                    uploaded: result.uploadedCount,
                    total: attachments.length,
                    defaultValue:
                      'Changes saved. {{uploaded}}/{{total}} attachments uploaded. You can retry failed uploads from the ticket.',
                  }),
                  'error',
                )
              }
            }

            if (stagedLinks.length > 0) {
              setLinkingIssues(true)
              const linkResult = await createStagedLinks(issue.id, stagedLinks)
              if (linkResult.failedCount > 0) {
                toast(
                  t('issues.linksPartialFailEdit', {
                    success: linkResult.successCount,
                    total: stagedLinks.length,
                    defaultValue:
                      'Changes saved. {{success}}/{{total}} links created. You can add remaining links from the ticket.',
                  }),
                  'error',
                )
              }
            }
          } finally {
            setUploadingAttachments(false)
            setLinkingIssues(false)
          }

          onOpenChange(false)
        },
      },
    )
  }

  const statuses = mapTicketStatuses(board?.statuses)
  const sprintOptions =
    sprints?.map((s) => ({
      id: s.id,
      name: s.name,
    })) ?? []

  return (
    <TicketModal
      open={open}
      onOpenChange={handleOpenChange}
      preventClose={isBusy}
    >
      <TicketModalHeader
        title={t('issues.editIssue')}
        subtitle={t(
          'issues.editIssueSubtitle',
          'Update issue details, collaboration, and planning',
        )}
        badge={issue?.key ?? (isLoading ? '…' : undefined)}
      />

      <TicketModalBody>
        {isLoading && !issue && (
          <div className="py-4">
            <ListSkeleton rows={6} />
          </div>
        )}

        {isError && !isLoading && (
          <p className="py-8 text-center text-sm text-destructive">
            {t('issues.loadFailed', 'Failed to load issue. Please try again.')}
          </p>
        )}

        {issue && (
          <>
            <IssueTicketForm
              key={formKey}
              ref={formRef}
              mode="edit"
              issueId={issue.id}
              projectId={issue.projectId}
              statuses={statuses}
              sprints={sprintOptions}
              users={projectUsers}
              isKanban={isKanban}
              defaultValues={issueToTicketFormValues(issue) as Partial<IssueTicketFormValues>}
              initialLabels={issue.labels ?? []}
              reporter={issue.reporter}
              excludeParentIds={[issue.id]}
              onSubmit={handleFormSubmit}
              onCancel={handleCancel}
              disabled={isBusy || !canEdit}
            />

            <TicketActivityTabs
              issueId={issue.id}
              projectId={issue.projectId}
              users={projectUsers}
              canModifyAnyComment={canModifyAnyComment}
            />
          </>
        )}

        {!isLoading && !issue && !isError && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('issues.issueNotFound')}
          </p>
        )}
      </TicketModalBody>

      <TicketModalFooter
        onCancel={() => formRef.current?.requestClose()}
        onSubmit={handleSubmit}
        submitLabel={t('issues.saveChanges', 'Save Changes')}
        isLoading={updateIssue.isPending || uploadingAttachments || linkingIssues}
        submitDisabled={!canEdit || !issue}
        showDelete={canDelete && !!issue}
        onDelete={() => setShowDeleteConfirm(true)}
        deleteDisabled={!issue}
        isDeleting={deleteIssue.isPending}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConfirm}
        title={t('issues.deleteIssue')}
        description={
          issue
            ? t('issues.deleteIssueConfirm', { title: issue.title })
            : t('issues.deleteConfirm')
        }
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        isLoading={deleteIssue.isPending}
      />
    </TicketModal>
  )
}
