import { AttachmentPanel } from '@/components/issues/attachment-panel'
import { TicketAttachmentDropzone } from './ticket-attachment-dropzone'

interface TicketAttachmentFieldProps {
  label?: string
  issueId?: string
  files: File[]
  onAdd: (files: File[]) => void
  onRemove: (file: File) => void
  disabled?: boolean
}

export function TicketAttachmentField({
  label,
  issueId,
  files,
  onAdd,
  onRemove,
  disabled,
}: TicketAttachmentFieldProps) {
  if (issueId) {
    // Edit mode: upload/delete happens immediately via AttachmentPanel
    return <AttachmentPanel issueId={issueId} />
  }

  // Create mode: stage uploads until ticket exists
  return (
    <TicketAttachmentDropzone
      label={label}
      files={files}
      onAdd={onAdd}
      onRemove={onRemove}
      disabled={disabled}
    />
  )
}
