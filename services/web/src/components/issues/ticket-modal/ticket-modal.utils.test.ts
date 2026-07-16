import { describe, expect, it } from 'vitest'
import {
  buildMediaThumbnailItem,
  extractFileIdsFromText,
  getFileViewUrl,
  parseFileIdFromViewUrl,
  resolveAttachmentMediaType,
} from '@/lib/uploadFile'
import {
  extractAttachmentIdsFromHtml,
  extractMediaFromHtml,
  hasRichTextContent,
  stripAttachmentFromHtml,
  stripInlineMediaFromHtml,
} from '@/components/issues/ticket-modal/ticket-modal.utils'

const FILE_ID = '8d0f89a8-f6de-4f44-b5c4-00faaefcf803'
const FILE_URL = `/api/files/${FILE_ID}/view`

describe('uploadFile url helpers', () => {
  it('builds stable file view URLs', () => {
    expect(getFileViewUrl(FILE_ID)).toBe(`/api/files/${FILE_ID}/view`)
  })

  it('parses file ids from view URLs', () => {
    expect(parseFileIdFromViewUrl(FILE_URL)).toBe(FILE_ID)
    expect(parseFileIdFromViewUrl('https://example.com/other')).toBeNull()
    expect(parseFileIdFromViewUrl(null)).toBeNull()
  })

  it('extracts all file ids from text', () => {
    const html = `<img src="${FILE_URL}" /><a href="/api/files/11111111-1111-4111-8111-111111111111/view">`
    expect(extractFileIdsFromText(html)).toEqual([
      FILE_ID,
      '11111111-1111-4111-8111-111111111111',
    ])
  })

  it('resolves attachment media types', () => {
    expect(resolveAttachmentMediaType('image/png')).toBe('image')
    expect(resolveAttachmentMediaType('video/mp4')).toBe('video')
    expect(resolveAttachmentMediaType('application/pdf')).toBe('file')
  })

  it('builds thumbnail items from attachment metadata', () => {
    expect(
      buildMediaThumbnailItem({
        id: FILE_ID,
        url: FILE_URL,
        fileName: 'More.png',
        mimeType: 'image/png',
      }),
    ).toEqual({
      id: FILE_ID,
      url: FILE_URL,
      fileName: 'More.png',
      mimeType: 'image/png',
      type: 'image',
    })
  })
})

describe('ticket-modal rich text helpers', () => {
  it('detects image-only comment content', () => {
    expect(hasRichTextContent(`<p><img src="${FILE_URL}" alt="More.png" /></p>`)).toBe(true)
    expect(hasRichTextContent('<p></p>')).toBe(false)
    expect(hasRichTextContent(null)).toBe(false)
  })

  it('extracts media items from saved HTML', () => {
    const html = `<p>note</p><img src="${FILE_URL}" alt="More.png" title="More.png" />`
    expect(extractMediaFromHtml(html)).toEqual([
      {
        id: FILE_ID,
        url: FILE_URL,
        fileName: 'More.png',
        type: 'image',
      },
    ])
  })

  it('deduplicates repeated media references', () => {
    const html = `<img src="${FILE_URL}" /><img src="${FILE_URL}" />`
    expect(extractMediaFromHtml(html)).toHaveLength(1)
    expect(extractAttachmentIdsFromHtml(html)).toEqual([FILE_ID])
  })

  it('strips inline media while preserving text', () => {
    const html = `<p>hello</p><img src="${FILE_URL}" alt="More.png" />`
    expect(stripInlineMediaFromHtml(html)).toBe('<p>hello</p>')
  })

  it('removes a specific attachment reference from HTML', () => {
    const html = `<img src="${FILE_URL}" /><img src="/api/files/11111111-1111-4111-8111-111111111111/view" />`
    expect(stripAttachmentFromHtml(html, FILE_ID)).not.toContain(FILE_ID)
    expect(stripAttachmentFromHtml(html, FILE_ID)).toContain('11111111-1111-4111-8111-111111111111')
  })
})
