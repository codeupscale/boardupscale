import { useRef, useState, useCallback, useMemo } from 'react'
import {
  Paperclip, Upload, Trash2, Download, File, Image as ImageIcon,
  FileText, Film, FileSpreadsheet, FileCode,
  Maximize2,
} from 'lucide-react'
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '@/hooks/useAttachments'
import { buildMediaThumbnailItem, getFileViewUrl } from '@/lib/uploadFile'
import { RICH_TEXT_ISSUE_CONTENT_MAX_HEIGHT } from '@/components/ui/rich-text-display'
import { MediaThumbnailGrid } from '@/components/ui/media-lightbox'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Attachment } from '@/types'

interface AttachmentPanelProps {
  issueId: string
  onAttachmentDeleted?: (attachmentId: string) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImage(mime: string) { return mime.startsWith('image/') }
function isVideo(mime: string) { return mime.startsWith('video/') }
function isPdf(mime: string) { return mime === 'application/pdf' }
function isSpreadsheet(mime: string) {
  return mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv'
}
function isCode(mime: string) {
  return mime.includes('json') || mime.includes('javascript') || mime.includes('xml') || mime.includes('yaml') || mime.includes('text/plain')
}

function getFileIcon(mimeType: string) {
  if (isImage(mimeType)) return <ImageIcon className="h-5 w-5 text-primary" />
  if (isVideo(mimeType)) return <Film className="h-5 w-5 text-purple-500" />
  if (isPdf(mimeType)) return <FileText className="h-5 w-5 text-red-500" />
  if (isSpreadsheet(mimeType)) return <FileSpreadsheet className="h-5 w-5 text-green-500" />
  if (isCode(mimeType)) return <FileCode className="h-5 w-5 text-amber-500" />
  return <File className="h-5 w-5 text-muted-foreground" />
}

function getFileColor(mimeType: string): string {
  if (isImage(mimeType)) return 'bg-primary/10 border-primary/20'
  if (isVideo(mimeType)) return 'bg-purple-50 dark:bg-purple-950/30 border-purple-100 dark:border-purple-900/40'
  if (isPdf(mimeType)) return 'bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/40'
  return 'bg-muted/50 border-border'
}

function FileCard({
  attachment,
  onDelete,
  isDeleting,
}: {
  attachment: Attachment
  onDelete: () => void
  isDeleting: boolean
}) {
  const url = getFileViewUrl(attachment.id)
  const colorClass = getFileColor(attachment.mimeType)

  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-xl border transition-colors group',
      colorClass,
    )}>
      <div className="shrink-0">
        {getFileIcon(attachment.mimeType)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {attachment.fileName}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          <span>{formatFileSize(Number(attachment.fileSize))}</span>
          {attachment.uploader && (
            <>
              <span className="text-muted-foreground">·</span>
              <span>{attachment.uploader.displayName}</span>
            </>
          )}
          <span className="text-muted-foreground">·</span>
          <span>{new Date(attachment.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          title="Open in new tab"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </a>
        <a
          href={url}
          download={attachment.fileName}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          title="Download"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function toVisualMediaItem(attachment: Attachment) {
  return buildMediaThumbnailItem({
    id: attachment.id,
    url: getFileViewUrl(attachment.id),
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
  })
}

export function AttachmentPanel({ issueId, onAttachmentDeleted }: AttachmentPanelProps) {
  const { data: attachments, isLoading } = useAttachments(issueId)
  const uploadAttachment = useUploadAttachment()
  const deleteAttachment = useDeleteAttachment()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach((file) => {
        uploadAttachment.mutate({ file, issueId })
      })
    },
    [issueId, uploadAttachment],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files)
      }
    },
    [handleFiles],
  )

  const ticketAttachments = (attachments || []).filter((a) => !a.commentId)
  const visualMedia = useMemo(
    () =>
      ticketAttachments
        .filter((a) => isImage(a.mimeType) || isVideo(a.mimeType))
        .map(toVisualMediaItem),
    [ticketAttachments],
  )
  const others = ticketAttachments.filter((a) => !isImage(a.mimeType) && !isVideo(a.mimeType))
  const totalCount = ticketAttachments.length

  const handleDelete = (attachmentId: string) => {
    deleteAttachment.mutate(
      { id: attachmentId, issueId },
      {
        onSuccess: () => {
          onAttachmentDeleted?.(attachmentId)
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Attachments
          {totalCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {totalCount}
            </span>
          )}
        </h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadAttachment.isPending}
        >
          <Upload className="h-3.5 w-3.5" />
          Upload
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            handleFiles(e.target.files)
            e.target.value = ''
          }
        }}
      />

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-xl p-5 text-center transition-all duration-200',
          isDragOver
            ? 'border-primary bg-primary/10 scale-[1.01]'
            : 'border-border hover:border-border',
        )}
      >
        {uploadAttachment.isPending ? (
          <div className="flex items-center justify-center gap-2">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-primary font-medium">Uploading...</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Drop files here or{' '}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-primary hover:underline font-medium"
              >
                browse
              </button>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Images, videos, documents — max 50 MB per file
            </p>
          </>
        )}
      </div>

      <div
        className="overflow-y-auto space-y-4"
        style={{ maxHeight: RICH_TEXT_ISSUE_CONTENT_MAX_HEIGHT }}
      >
        {isLoading && (
          <div className="text-sm text-muted-foreground text-center py-6">Loading attachments...</div>
        )}

        {visualMedia.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" />
              Photos & videos ({visualMedia.length})
            </h4>
            <MediaThumbnailGrid
              items={visualMedia}
              onRemove={handleDelete}
              disabled={deleteAttachment.isPending}
            />
          </div>
        )}

        {others.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <File className="h-3.5 w-3.5" />
              Documents ({others.length})
            </h4>
            <div className="space-y-1.5">
              {others.map((attachment) => (
                <FileCard
                  key={attachment.id}
                  attachment={attachment}
                  onDelete={() => handleDelete(attachment.id)}
                  isDeleting={deleteAttachment.isPending}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
