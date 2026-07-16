import { AttachmentPanel } from '@/components/issues/attachment-panel'
import { TicketAttachmentDropzone } from './ticket-attachment-dropzone'
import { getFileViewUrl } from '@/lib/uploadFile'
import type { RemoteTicketAttachment } from '../ticket-modal.types'

interface TicketAttachmentFieldProps {
  label?: string
  issueId?: string
  projectId: string
  remoteAttachments?: RemoteTicketAttachment[]
  onUploaded: (attachment: {
    id: string
    fileName: string
    mimeType?: string
  }) => void
  onRemoveRemote?: (attachmentId: string) => void
  onAttachmentDeleted?: (attachmentId: string) => void
  disabled?: boolean
}

export function TicketAttachmentField({
  label,
  issueId,
  projectId,
  remoteAttachments = [],
  onUploaded,
  onRemoveRemote,
  onAttachmentDeleted,
  disabled,
}: TicketAttachmentFieldProps) {
  if (issueId) {
    return (
      <AttachmentPanel
        issueId={issueId}
        onAttachmentDeleted={onAttachmentDeleted}
      />
    )
  }

  return (
    <TicketAttachmentDropzone
      label={label}
      projectId={projectId}
      remoteAttachments={remoteAttachments.map((attachment) => ({
        ...attachment,
        url: attachment.url || getFileViewUrl(attachment.id),
      }))}
      onUploaded={onUploaded}
      onRemoveRemote={onRemoveRemote}
      disabled={disabled}
    />
  )
}
