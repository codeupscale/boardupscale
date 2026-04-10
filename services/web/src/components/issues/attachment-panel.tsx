import { useRef, useState, useCallback } from 'react'
import {
  Paperclip, Upload, Trash2, Download, File, Image as ImageIcon,
  FileText, Film, X, ZoomIn, Play, FileSpreadsheet, FileCode,
  Maximize2,
} from 'lucide-react'
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '@/hooks/useAttachments'
import { getFileViewUrl } from '@/components/ui/rich-text-editor'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Attachment } from '@/types'

interface AttachmentPanelProps {
  issueId: string
}

// ── Helpers ──────────────────────────────────────

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
  if (isImage(mimeType)) return <ImageIcon className="h-5 w-5 text-blue-500" />
  if (isVideo(mimeType)) return <Film className="h-5 w-5 text-purple-500" />
  if (isPdf(mimeType)) return <FileText className="h-5 w-5 text-red-500" />
  if (isSpreadsheet(mimeType)) return <FileSpreadsheet className="h-5 w-5 text-green-500" />
  if (isCode(mimeType)) return <FileCode className="h-5 w-5 text-amber-500" />
  return <File className="h-5 w-5 text-gray-400" />
}

function getFileColor(mimeType: string): string {
  if (isImage(mimeType)) return 'bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/40'
  if (isVideo(mimeType)) return 'bg-purple-50 dark:bg-purple-950/30 border-purple-100 dark:border-purple-900/40'
  if (isPdf(mimeType)) return 'bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/40'
  return 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700/50'
}

// ── Lightbox ─────────────────────────────────────

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

// ── Video Player ─────────────────────────────────

function VideoPlayer({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
      <video
        src={src}
        controls
        autoPlay
        className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

// ── Image Thumbnail ──────────────────────────────

function ImageThumbnail({ attachment, onClick }: { attachment: Attachment; onClick: () => void }) {
  const url = getFileViewUrl(attachment.id)
  return (
    <div
      className="relative group cursor-pointer rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 aspect-square"
      onClick={onClick}
    >
      <img
        src={url}
        alt={attachment.fileName}
        loading="lazy"
        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
        <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 drop-shadow-lg" />
      </div>
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <p className="text-[10px] text-white truncate font-medium">{attachment.fileName}</p>
        <p className="text-[9px] text-white/70">{formatFileSize(Number(attachment.fileSize))}</p>
      </div>
    </div>
  )
}

// ── Video Thumbnail ──────────────────────────────

function VideoThumbnail({ attachment, onClick }: { attachment: Attachment; onClick: () => void }) {
  return (
    <div
      className="relative group cursor-pointer rounded-lg overflow-hidden border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 aspect-square flex items-center justify-center"
      onClick={onClick}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center group-hover:bg-purple-200 dark:group-hover:bg-purple-900 transition-colors">
          <Play className="h-5 w-5 text-purple-600 dark:text-purple-400 ml-0.5" />
        </div>
        <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium px-2 text-center truncate max-w-full">
          {attachment.fileName}
        </span>
      </div>
      <div className="absolute top-1.5 right-1.5">
        <span className="text-[9px] bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full font-medium">
          {formatFileSize(Number(attachment.fileSize))}
        </span>
      </div>
    </div>
  )
}

// ── File Card ────────────────────────────────────

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
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {attachment.fileName}
        </p>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          <span>{formatFileSize(Number(attachment.fileSize))}</span>
          {attachment.uploader && (
            <>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span>{attachment.uploader.displayName}</span>
            </>
          )}
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <span>{new Date(attachment.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30 transition-colors"
          title="Open in new tab"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </a>
        <a
          href={url}
          download={attachment.fileName}
          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30 transition-colors"
          title="Download"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Main Panel ───────────────────────────────────

export function AttachmentPanel({ issueId }: AttachmentPanelProps) {
  const { data: attachments, isLoading } = useAttachments(issueId)
  const uploadAttachment = useUploadAttachment()
  const deleteAttachment = useDeleteAttachment()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [lightbox, setLightbox] = useState<{ type: 'image' | 'video'; src: string; alt: string } | null>(null)

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

  const images = attachments?.filter((a) => isImage(a.mimeType)) || []
  const videos = attachments?.filter((a) => isVideo(a.mimeType)) || []
  const others = attachments?.filter((a) => !isImage(a.mimeType) && !isVideo(a.mimeType)) || []
  const totalCount = attachments?.length || 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Attachments
          {totalCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-400">
              {totalCount}
            </span>
          )}
        </h3>
        <Button
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

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-xl p-5 text-center transition-all duration-200',
          isDragOver
            ? 'border-blue-400 bg-blue-50/80 dark:border-blue-500 dark:bg-blue-950/30 scale-[1.01]'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
        )}
      >
        {uploadAttachment.isPending ? (
          <div className="flex items-center justify-center gap-2">
            <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Uploading...</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Drop files here or{' '}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                browse
              </button>
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Images, videos, documents — max 50 MB per file
            </p>
          </>
        )}
      </div>

      {isLoading && (
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">Loading attachments...</div>
      )}

      {/* Image Grid */}
      {images.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" />
            Images ({images.length})
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {images.map((attachment) => (
              <div key={attachment.id} className="relative group">
                <ImageThumbnail
                  attachment={attachment}
                  onClick={() => setLightbox({
                    type: 'image',
                    src: getFileViewUrl(attachment.id),
                    alt: attachment.fileName,
                  })}
                />
                <button
                  onClick={() => deleteAttachment.mutate({ id: attachment.id, issueId })}
                  className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/40 hover:bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video List */}
      {videos.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Film className="h-3.5 w-3.5" />
            Videos ({videos.length})
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {videos.map((attachment) => (
              <div key={attachment.id} className="relative group">
                <VideoThumbnail
                  attachment={attachment}
                  onClick={() => setLightbox({
                    type: 'video',
                    src: getFileViewUrl(attachment.id),
                    alt: attachment.fileName,
                  })}
                />
                <button
                  onClick={() => deleteAttachment.mutate({ id: attachment.id, issueId })}
                  className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/40 hover:bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other Files */}
      {others.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <File className="h-3.5 w-3.5" />
            Documents ({others.length})
          </h4>
          <div className="space-y-1.5">
            {others.map((attachment) => (
              <FileCard
                key={attachment.id}
                attachment={attachment}
                onDelete={() => deleteAttachment.mutate({ id: attachment.id, issueId })}
                isDeleting={deleteAttachment.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Lightbox / Video Player */}
      {lightbox?.type === 'image' && (
        <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      )}
      {lightbox?.type === 'video' && (
        <VideoPlayer src={lightbox.src} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}
