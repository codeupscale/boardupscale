import { uploadFile } from '@/lib/uploadFile'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // 50 MB (matches API limit)

export type AttachmentUploadResult = {
  uploadedCount: number
  failedCount: number
  failures: Array<{ fileName: string; reason: string }>
}

export async function uploadIssueAttachments(
  files: File[],
  opts: { issueId: string; projectId?: string },
): Promise<AttachmentUploadResult> {
  const failures: AttachmentUploadResult['failures'] = []
  let uploadedCount = 0

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      failures.push({
        fileName: file.name,
        reason: 'File too large (max 50 MB)',
      })
      continue
    }

    try {
      await uploadFile(file, { issueId: opts.issueId, projectId: opts.projectId })
      uploadedCount += 1
    } catch (err: any) {
      failures.push({
        fileName: file.name,
        reason:
          err?.response?.data?.message ||
          err?.message ||
          'Upload failed',
      })
    }
  }

  return {
    uploadedCount,
    failedCount: failures.length,
    failures,
  }
}

