import api from '@/lib/api'

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
  })

  return confirmRes.data as UploadedAttachment
}
