import api from '@/lib/api'
import type { MediaKind, MediaThumbnailItem } from '@/types'

/** Matches `/files/:uuid/view` in absolute or relative URLs. */
export const FILE_VIEW_ID_CAPTURE_REGEX =
  /\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/view/gi

/** Build a permanent authenticated file view URL for img/video src. */
export function getFileViewUrl(fileId: string): string {
  const baseURL = api.defaults.baseURL || '/api'
  return `${baseURL}/files/${fileId}/view`
}

/** Parse attachment UUID from a file view URL, or null when not a board file URL. */
export function parseFileIdFromViewUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const match = url.match(
    /\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/view/i,
  )
  return match?.[1] ?? null
}

/** Collect every file view id embedded in a string (e.g. rich-text HTML). */
export function extractFileIdsFromText(text: string | null | undefined): string[] {
  if (!text) return []
  const ids = new Set<string>()
  const re = new RegExp(FILE_VIEW_ID_CAPTURE_REGEX.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match[1]) ids.add(match[1])
  }
  return [...ids]
}

export function resolveAttachmentMediaType(mimeType?: string): MediaKind {
  if (!mimeType) return 'image'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return 'file'
}

export function buildMediaThumbnailItem(input: {
  id: string
  url: string
  fileName: string
  mimeType?: string
}): MediaThumbnailItem {
  return {
    id: input.id,
    url: input.url,
    fileName: input.fileName,
    mimeType: input.mimeType,
    type: resolveAttachmentMediaType(input.mimeType),
  }
}

/**
 * Uploads a file directly from the browser to object storage using a
 * presigned PUT URL, then confirms the upload with the API to create the
 * Attachment record. The API server never proxies the bytes.
 */
export interface UploadedAttachment {
  id: string
  fileName: string
  mimeType: string
  fileSize: number
  storageKey: string
  storageBucket: string
}

export interface UploadOptions {
  issueId?: string
  commentId?: string
  /** Project UUID or key — used for permission check before an issue exists */
  projectId?: string
  onProgress?: (loaded: number, total: number) => void
}

interface PresignResponse {
  url: string
  storageKey: string
  storageBucket: string
  headers: Record<string, string>
  expiresIn: number
}

export async function uploadFile(
  file: File,
  opts: UploadOptions = {},
): Promise<UploadedAttachment> {
  // 1. Ask the API for a presigned URL.
  const { data: presignRes } = await api.post('/files/presign-upload', {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    fileSize: file.size,
    issueId: opts.issueId,
    projectId: opts.projectId,
  })
  const presign: PresignResponse = presignRes.data

  // 2. PUT the file bytes directly to storage. Use XHR for progress.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', presign.url, true)
    for (const [k, v] of Object.entries(presign.headers || {})) {
      xhr.setRequestHeader(k, v)
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) opts.onProgress(e.loaded, e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed with status ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.onabort = () => reject(new Error('Upload aborted'))
    xhr.send(file)
  })

  // 3. Confirm with the API to create the Attachment row.
  const { data: confirmRes } = await api.post('/files/confirm-upload', {
    storageKey: presign.storageKey,
    storageBucket: presign.storageBucket,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    fileSize: file.size,
    issueId: opts.issueId,
    commentId: opts.commentId,
    projectId: opts.projectId,
  })

  return confirmRes.data as UploadedAttachment
}
