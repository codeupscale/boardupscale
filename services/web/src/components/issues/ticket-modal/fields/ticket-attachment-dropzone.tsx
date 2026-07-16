import { useCallback, useRef, useState } from 'react'
import { UploadCloud, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TicketFormField } from '../ticket-form-layout'
import { MediaThumbnailGrid } from '@/components/ui/media-lightbox'
import { buildMediaThumbnailItem, getFileViewUrl, uploadFile } from '@/lib/uploadFile'
import { cn } from '@/lib/utils'
import { TICKET_ATTACHMENT_MAX_BYTES } from '../ticket-modal.constants'
import type { RemoteTicketAttachment } from '../ticket-modal.types'
import { toast } from '@/store/ui.store'

interface TicketAttachmentDropzoneProps {
  projectId: string
  remoteAttachments?: RemoteTicketAttachment[]
  onUploaded: (attachment: {
    id: string
    fileName: string
    mimeType?: string
  }) => void
  onRemoveRemote?: (attachmentId: string) => void
  label?: string
  disabled?: boolean
}

export function TicketAttachmentDropzone({
  projectId,
  remoteAttachments = [],
  onUploaded,
  onRemoveRemote,
  label,
  disabled,
}: TicketAttachmentDropzoneProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadingCount, setUploadingCount] = useState(0)

  const uploadFiles = useCallback(
    async (incoming: FileList | File[]) => {
      const list = Array.from(incoming).filter(Boolean)
      if (list.length === 0) return
      if (!projectId) {
        toast(
          t('issues.attachmentProjectMissing', 'Project is required to upload files.'),
          'error',
        )
        return
      }

      for (const file of list) {
        if (file.size > TICKET_ATTACHMENT_MAX_BYTES) {
          toast(
            t('issues.attachmentTooLarge', {
              name: file.name,
              defaultValue: '{{name}} is too large (max 50 MB).',
            }),
            'error',
          )
          continue
        }

        setUploadingCount((c) => c + 1)
        try {
          const attachment = await uploadFile(file, { projectId })
          onUploaded({
            id: attachment.id,
            fileName: attachment.fileName || file.name,
            mimeType: attachment.mimeType || file.type || undefined,
          })
        } catch (err: unknown) {
          const message =
            (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
            t('issues.attachmentUploadFailed', {
              name: file.name,
              defaultValue: 'Failed to upload {{name}}',
            })
          toast(message, 'error')
        } finally {
          setUploadingCount((c) => Math.max(0, c - 1))
        }
      }
    },
    [onUploaded, projectId, t],
  )

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled || uploadingCount > 0) return
    void uploadFiles(e.dataTransfer.files)
  }

  const isBusy = disabled || uploadingCount > 0
  const hasFiles = remoteAttachments.length > 0
  const thumbnailItems = remoteAttachments.map((remote) =>
    buildMediaThumbnailItem({
      id: remote.id,
      url: remote.url ?? getFileViewUrl(remote.id),
      fileName: remote.fileName,
      mimeType: remote.mimeType,
    }),
  )

  return (
    <TicketFormField label={label ?? t('common.attachments', 'Attachments')}>
      {hasFiles && (
        <MediaThumbnailGrid
          className="mb-3"
          items={thumbnailItems}
          disabled={isBusy}
          onRemove={onRemoveRemote}
        />
      )}

      <div
        role="button"
        tabIndex={isBusy ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          if (!isBusy) setIsDragging(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!isBusy) setIsDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setIsDragging(false)
        }}
        onDrop={onDrop}
        onClick={() => !isBusy && inputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8',
          'cursor-pointer transition-colors text-center',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'bg-card border-border/80 hover:border-primary/50',
          isBusy && 'opacity-50 pointer-events-none cursor-not-allowed',
        )}
      >
        {uploadingCount > 0 ? (
          <>
            <Loader2 className="h-8 w-8 text-primary mb-2 animate-spin" />
            <p className="text-sm text-foreground/90">
              {t('issues.uploadingAttachments', {
                count: uploadingCount,
                defaultValue: 'Uploading {{count}} file(s)…',
              })}
            </p>
          </>
        ) : (
          <>
            <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-foreground/90">
              {t('issues.attachmentsDropzone', 'Drag and drop files here, or click to upload')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t(
                'issues.attachmentsDropzoneHint',
                'Supports images, PDFs, docs and more (max 50MB per file)',
              )}
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          disabled={isBusy}
          onChange={(e) => {
            if (e.target.files) void uploadFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
    </TicketFormField>
  )
}
