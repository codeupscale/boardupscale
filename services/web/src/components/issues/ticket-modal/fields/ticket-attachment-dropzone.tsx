import { useCallback, useRef, useState } from 'react'
import { UploadCloud, FileIcon, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TicketFormField } from '../ticket-form-layout'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TICKET_ATTACHMENT_MAX_BYTES } from '../ticket-modal.constants'

interface TicketAttachmentDropzoneProps {
  files: File[]
  onAdd: (files: File[]) => void
  onRemove: (file: File) => void
  label?: string
  disabled?: boolean
}

export function TicketAttachmentDropzone({
  files,
  onAdd,
  onRemove,
  label,
  disabled,
}: TicketAttachmentDropzoneProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFiles = useCallback(
    (incoming: FileList | File[]) => {
      const list = Array.from(incoming)
      if (list.length === 0) return
      onAdd(list)
    },
    [onAdd],
  )

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return
    handleFiles(e.dataTransfer.files)
  }

  return (
    <TicketFormField label={label ?? t('common.attachments', 'Attachments')}>
      {files.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {files.map((file) => {
            const tooLarge = file.size > TICKET_ATTACHMENT_MAX_BYTES
            return (
              <div
                key={`${file.name}-${file.size}-${file.lastModified}`}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5',
                  tooLarge
                    ? 'border-destructive/50 bg-destructive/5'
                    : 'border-border bg-muted/40',
                )}
              >
                <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate max-w-[180px]">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                    {tooLarge && ` — ${t('common.tooLarge', 'Too large')}`}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRemove(file)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('common.remove', 'Remove')}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      )}

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          if (!disabled) setIsDragging(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setIsDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setIsDragging(false)
        }}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8',
          'cursor-pointer transition-colors text-center',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'bg-card border-border/80 hover:border-primary/50',
          disabled && 'opacity-50 pointer-events-none cursor-not-allowed',
        )}
      >
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
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
    </TicketFormField>
  )
}
