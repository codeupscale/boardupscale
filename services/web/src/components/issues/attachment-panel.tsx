import { useRef, useState, useCallback } from 'react'
import { Paperclip, Upload, Trash2, Download, File, Image, FileText, Film, X } from 'lucide-react'
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '@/hooks/useAttachments'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { Attachment } from '@/types'

interface AttachmentPanelProps {
  issueId: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <Image className="h-4 w-4 text-blue-500" />
  if (mimeType === 'application/pdf') return <FileText className="h-4 w-4 text-red-500" />
  if (mimeType.startsWith('video/')) return <Film className="h-4 w-4 text-purple-500" />
  return <File className="h-4 w-4 text-gray-500" />
}

export function AttachmentPanel({ issueId }: AttachmentPanelProps) {
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

  const handleDownload = async (attachment: Attachment) => {
    try {
      const { data } = await api.get(`/files/${attachment.id}`, { maxRedirects: 0 })
      const url = data?.url || data?.data?.url
      if (url) {
        window.open(url, '_blank')
      }
    } catch (err: any) {
      // The API uses @Redirect, so the browser will follow the redirect automatically
      // If we get a redirect response, open the file URL directly
      if (err?.response?.status === 302 || err?.response?.status === 301) {
        const redirectUrl = err.response.headers?.location
        if (redirectUrl) window.open(redirectUrl, '_blank')
      } else {
        window.open(`${api.defaults.baseURL}/files/${attachment.id}`, '_blank')
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Attachments
          {attachments && attachments.length > 0 && (
            <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
              ({attachments.length})
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
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-4 text-center transition-colors',
          isDragOver
            ? 'border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/30'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
        )}
      >
        {uploadAttachment.isPending ? (
          <p className="text-sm text-blue-600 dark:text-blue-400">Uploading...</p>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Drop files here or{' '}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              browse
            </button>
          </p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Max 50 MB per file</p>
      </div>

      {/* Attachment list */}
      {isLoading ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Loading...</div>
      ) : attachments && attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 group hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors"
            >
              {getFileIcon(attachment.mimeType)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {attachment.fileName}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>{formatFileSize(Number(attachment.fileSize))}</span>
                  {attachment.uploader && (
                    <>
                      <span>by</span>
                      <span className="font-medium">{attachment.uploader.displayName}</span>
                    </>
                  )}
                  <span>{new Date(attachment.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleDownload(attachment)}
                  className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30 transition-colors"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  onClick={() => deleteAttachment.mutate({ id: attachment.id, issueId })}
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
