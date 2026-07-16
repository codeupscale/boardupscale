import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { FileIcon, Film, Play, X, ZoomIn } from 'lucide-react'
import {
  MEDIA_LIGHTBOX_OPEN_ATTR,
  MEDIA_LIGHTBOX_SELECTOR,
  MEDIA_LIGHTBOX_Z_INDEX,
  MEDIA_THUMBNAIL_WIDTH_CLASS,
} from '@/components/issues/ticket-modal/ticket-modal.constants'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MediaLightboxItem, MediaThumbnailGridProps, MediaThumbnailItem } from '@/types'

function stopEventPropagation(e: React.SyntheticEvent) {
  e.stopPropagation()
}

export function MediaLightbox({
  item,
  onClose,
}: {
  item: MediaLightboxItem | null
  onClose: () => void
}) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const handleClose = useCallback(() => {
    onCloseRef.current()
  }, [])

  useEffect(() => {
    if (!item) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      handleClose()
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.body.setAttribute(MEDIA_LIGHTBOX_OPEN_ATTR, 'true')

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.removeAttribute(MEDIA_LIGHTBOX_OPEN_ATTR)
    }
  }, [item, handleClose])

  if (!item || typeof document === 'undefined') return null

  return createPortal(
    <div
      data-media-lightbox
      role="dialog"
      aria-modal="true"
      aria-label={item.type === 'image' ? item.alt : 'Video player'}
      className="fixed inset-0 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto"
      style={{ zIndex: MEDIA_LIGHTBOX_Z_INDEX }}
      onPointerDown={stopEventPropagation}
      onPointerDownCapture={stopEventPropagation}
      onClick={(e) => {
        stopEventPropagation(e)
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <button
        type="button"
        onPointerDown={stopEventPropagation}
        onClick={(e) => {
          stopEventPropagation(e)
          handleClose()
        }}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10 pointer-events-auto"
        aria-label="Close preview"
      >
        <X className="h-5 w-5" />
      </button>
      {item.type === 'image' ? (
        <img
          src={item.src}
          alt={item.alt}
          className="max-w-[min(90vw,1200px)] max-h-[90vh] w-auto h-auto object-contain rounded-lg shadow-2xl pointer-events-auto"
          onPointerDown={stopEventPropagation}
          onClick={stopEventPropagation}
        />
      ) : (
        <video
          src={item.src}
          controls
          autoPlay
          className="max-w-[min(90vw,1200px)] max-h-[90vh] rounded-lg shadow-2xl pointer-events-auto"
          onPointerDown={stopEventPropagation}
          onClick={stopEventPropagation}
        />
      )}
    </div>,
    document.body,
  )
}

function MediaThumbnailChip({
  item,
  label,
  disabled,
  onOpen,
  onRemove,
  removeLabel,
}: {
  item: MediaThumbnailItem
  label: string
  disabled?: boolean
  onOpen: () => void
  onRemove?: (id: string) => void
  removeLabel: string
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const canPreview = item.type === 'image' || item.type === 'video'

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (!disabled) onOpen()
      }}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'relative group rounded-lg overflow-hidden border border-border bg-muted aspect-square',
        MEDIA_THUMBNAIL_WIDTH_CLASS,
        !disabled && 'cursor-pointer',
      )}
    >
      {item.type === 'image' && !imgFailed ? (
        <img
          src={item.url}
          alt={label}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          onError={() => setImgFailed(true)}
        />
      ) : item.type === 'video' ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-purple-50 dark:bg-purple-950/30 px-2">
          <div className="h-9 w-9 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
            <Play className="h-4 w-4 text-purple-600 dark:text-purple-400 ml-0.5" />
          </div>
          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium truncate max-w-full">
            {label}
          </span>
          <Film className="absolute top-1.5 right-1.5 h-3 w-3 text-purple-500/70" />
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2">
          <FileIcon className="h-6 w-6 text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground truncate max-w-full px-1">{label}</p>
        </div>
      )}
      {canPreview && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center pointer-events-none">
          <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 pointer-events-none">
        <p className="text-[10px] text-white truncate font-medium">{label}</p>
      </div>
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(item.id)
          }}
          className="absolute top-1 right-1 h-6 w-6 bg-black/50 text-white hover:bg-black/70 hover:text-white"
          aria-label={removeLabel}
          disabled={disabled}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

export function MediaThumbnailGrid({
  items,
  className,
  onRemove,
  removeLabel,
  disabled = false,
}: MediaThumbnailGridProps) {
  const { t } = useTranslation()
  const [lightbox, setLightbox] = useState<MediaLightboxItem | null>(null)
  const resolvedRemoveLabel = removeLabel ?? t('common.remove', 'Remove')

  if (items.length === 0) return null

  const resolveLabel = (item: MediaThumbnailItem) =>
    item.fileName ||
    (item.type === 'video'
      ? t('issues.mediaVideoFallback', 'Video')
      : item.type === 'file'
        ? t('common.attachments', 'Attachments')
        : t('issues.mediaImageFallback', 'Image'))

  const openItem = (item: MediaThumbnailItem) => {
    if (disabled) return
    if (item.type === 'image' || item.type === 'video') {
      setLightbox({
        type: item.type,
        src: item.url,
        alt: resolveLabel(item),
      })
      return
    }
    window.open(item.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {items.map((item) => (
          <MediaThumbnailChip
            key={item.id}
            item={item}
            label={resolveLabel(item)}
            disabled={disabled}
            onOpen={() => openItem(item)}
            onRemove={onRemove}
            removeLabel={resolvedRemoveLabel}
          />
        ))}
      </div>
      <MediaLightbox item={lightbox} onClose={() => setLightbox(null)} />
    </>
  )
}

export { MEDIA_LIGHTBOX_SELECTOR, MEDIA_LIGHTBOX_OPEN_ATTR }
