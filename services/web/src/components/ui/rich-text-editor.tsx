import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import { Plugin as PmPlugin, PluginKey } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import ImageExt from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Mention from '@tiptap/extension-mention'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import api from '@/lib/api'
import { toast } from '@/store/ui.store'
import { User } from '@/types'
import {
  Bold,
  Italic,
  UnderlineIcon,
  Strikethrough,
  Heading2,
  Code,
  List,
  ListOrdered,
  Quote,
  Minus,
  Link as LinkIcon,
  ImagePlus,
  Paperclip,
  Loader2,
} from 'lucide-react'

// ──────────────────────────────────────────────
// File upload helper
// ──────────────────────────────────────────────
async function uploadFileAndGetUrl(file: File, issueId?: string): Promise<{ id: string; url: string; fileName: string; mimeType: string }> {
  const formData = new FormData()
  formData.append('file', file)
  if (issueId) formData.append('issueId', issueId)

  const { data: uploadData } = await api.post('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  const attachment = uploadData.data ?? uploadData

  // Get presigned URL for display
  const { data: urlData } = await api.get(`/files/${attachment.id}/url`)
  const url = urlData.data?.url ?? urlData.url

  return { id: attachment.id, url, fileName: attachment.fileName, mimeType: attachment.mimeType }
}

// ──────────────────────────────────────────────
// Toolbar button
// ──────────────────────────────────────────────
function ToolbarButton({
  onClick,
  active,
  title,
  disabled,
  children,
}: {
  onClick: () => void
  active?: boolean
  title: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault()
        if (!disabled) onClick()
      }}
      className={cn(
        'p-1.5 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 transition-colors',
        active && 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100',
        disabled && 'opacity-40 pointer-events-none',
      )}
    >
      {children}
    </button>
  )
}

// ──────────────────────────────────────────────
// Mention popup state
// ──────────────────────────────────────────────
interface MentionPopupState {
  visible: boolean
  users: User[]
  selectedIndex: number
  position: { top: number; left: number }
}

// ──────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────
interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  users?: User[]
  minHeight?: number
  autoFocus?: boolean
  className?: string
  issueId?: string
  onFileUploaded?: (attachment: { id: string; fileName: string }) => void
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write something…',
  users = [],
  minHeight = 120,
  autoFocus = false,
  className,
  issueId,
  onFileUploaded,
}: RichTextEditorProps) {
  // ── Upload state ─────────────────────────────
  const [uploading, setUploading] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachInputRef = useRef<HTMLInputElement>(null)

  // ── Stable refs for values that change but need to be read from plugins ──
  const issueIdRef = useRef(issueId)
  issueIdRef.current = issueId
  const onFileUploadedRef = useRef(onFileUploaded)
  onFileUploadedRef.current = onFileUploaded

  // ── Mention popup state ───────────────────────
  const [mentionPopup, setMentionPopup] = useState<MentionPopupState>({
    visible: false,
    users: [],
    selectedIndex: 0,
    position: { top: 0, left: 0 },
  })

  const mentionPopupRef = useRef(mentionPopup)
  mentionPopupRef.current = mentionPopup
  const selectMentionRef = useRef<((user: User) => void) | null>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const usersRef = useRef(users)
  usersRef.current = users

  // ── Upload + insert — reads from refs so it's always current ──
  const uploadAndInsert = useCallback(async (file: File, editorInstance: any) => {
    if (!editorInstance) return

    // Validate file size (50 MB)
    if (file.size > 50 * 1024 * 1024) {
      toast('File too large. Maximum size is 50 MB.', 'error')
      return
    }

    setUploading((c) => c + 1)

    // Insert a placeholder while uploading
    const isImage = file.type.startsWith('image/')
    let placeholderText = ''
    if (isImage) {
      placeholderText = `[Uploading ${file.name}...]`
      editorInstance.chain().focus().insertContent(placeholderText).run()
    }

    try {
      const result = await uploadFileAndGetUrl(file, issueIdRef.current)

      if (isImage) {
        // Remove the placeholder text and insert the image
        const currentHtml = editorInstance.getHTML()
        const cleaned = currentHtml.replace(placeholderText, '')
        editorInstance.commands.setContent(cleaned, { emitUpdate: false })

        // Insert image at end (safest after content replacement)
        editorInstance.chain().focus().setImage({
          src: result.url,
          alt: result.fileName,
          title: result.fileName,
        }).run()
      } else if (file.type.startsWith('video/')) {
        const videoHtml = `<p><a href="${result.url}" target="_blank" rel="noopener noreferrer">🎬 ${result.fileName}</a></p>`
        editorInstance.chain().focus().insertContent(videoHtml).run()
      } else {
        const fileHtml = `<p><a href="${result.url}" target="_blank" rel="noopener noreferrer">📎 ${result.fileName}</a></p>`
        editorInstance.chain().focus().insertContent(fileHtml).run()
      }

      onFileUploadedRef.current?.({ id: result.id, fileName: result.fileName })
      toast(`${isImage ? 'Image' : 'File'} uploaded successfully`)
    } catch (err: any) {
      console.error('File upload failed:', err)
      toast(err?.response?.data?.message || 'Failed to upload file', 'error')

      // Remove placeholder on failure
      if (isImage && placeholderText) {
        const currentHtml = editorInstance.getHTML()
        const cleaned = currentHtml.replace(placeholderText, '')
        editorInstance.commands.setContent(cleaned, { emitUpdate: false })
      }
    } finally {
      setUploading((c) => c - 1)
    }
  }, []) // No deps — reads everything from refs

  // Store uploadAndInsert in a ref so ProseMirror plugins always call the latest
  const uploadAndInsertRef = useRef(uploadAndInsert)
  uploadAndInsertRef.current = uploadAndInsert

  // ── Build Mention extension ───────────────────
  const mentionExtension = Mention.configure({
    HTMLAttributes: { class: 'mention' },
    suggestion: {
      items: ({ query }: { query: string }) => {
        if (!usersRef.current.length) return []
        const q = query.toLowerCase()
        return usersRef.current
          .filter(
            (u) =>
              u.displayName.toLowerCase().includes(q) ||
              u.email.toLowerCase().includes(q),
          )
          .slice(0, 8)
      },
      render: () => {
        return {
          onStart: (props: any) => {
            const filteredUsers = props.items as User[]
            const rect = props.clientRect?.()
            const containerRect = editorContainerRef.current?.getBoundingClientRect()

            setMentionPopup({
              visible: true,
              users: filteredUsers,
              selectedIndex: 0,
              position:
                rect && containerRect
                  ? {
                      top: rect.bottom - containerRect.top + 4,
                      left: rect.left - containerRect.left,
                    }
                  : { top: 0, left: 0 },
            })

            selectMentionRef.current = (user: User) => {
              props.command({ id: user.id, label: user.displayName })
            }
          },

          onUpdate: (props: any) => {
            const filteredUsers = props.items as User[]
            const rect = props.clientRect?.()
            const containerRect = editorContainerRef.current?.getBoundingClientRect()

            setMentionPopup((prev) => ({
              ...prev,
              users: filteredUsers,
              selectedIndex: 0,
              position:
                rect && containerRect
                  ? {
                      top: rect.bottom - containerRect.top + 4,
                      left: rect.left - containerRect.left,
                    }
                  : prev.position,
            }))

            selectMentionRef.current = (user: User) => {
              props.command({ id: user.id, label: user.displayName })
            }
          },

          onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            const popup = mentionPopupRef.current
            if (!popup.visible || popup.users.length === 0) return false

            if (event.key === 'ArrowDown') {
              setMentionPopup((prev) => ({
                ...prev,
                selectedIndex: (prev.selectedIndex + 1) % prev.users.length,
              }))
              return true
            }
            if (event.key === 'ArrowUp') {
              setMentionPopup((prev) => ({
                ...prev,
                selectedIndex:
                  (prev.selectedIndex - 1 + prev.users.length) % prev.users.length,
              }))
              return true
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              const user = popup.users[popup.selectedIndex]
              if (user && selectMentionRef.current) {
                selectMentionRef.current(user)
                setMentionPopup((prev) => ({ ...prev, visible: false }))
              }
              return true
            }
            if (event.key === 'Escape') {
              setMentionPopup((prev) => ({ ...prev, visible: false }))
              return true
            }
            return false
          },

          onExit: () => {
            setMentionPopup((prev) => ({ ...prev, visible: false }))
            selectMentionRef.current = null
          },
        }
      },
    },
  })

  // ── ProseMirror plugin for paste/drop — uses ref so it never goes stale ──
  const FileHandlerPlugin = Extension.create({
    name: 'fileHandler',
    addProseMirrorPlugins() {
      const editor = this.editor
      return [
        new PmPlugin({
          key: new PluginKey('fileHandler'),
          props: {
            handlePaste(_view, event) {
              const items = event.clipboardData?.items
              if (!items) return false

              const imageItems = Array.from(items).filter((item) => item.type.startsWith('image/'))
              if (imageItems.length === 0) return false

              // Prevent default paste of the image (which would insert base64)
              event.preventDefault()

              for (const item of imageItems) {
                const file = item.getAsFile()
                if (file) {
                  uploadAndInsertRef.current(file, editor)
                }
              }
              return true
            },
            handleDrop(_view, event) {
              const files = event.dataTransfer?.files
              if (!files || files.length === 0) return false

              event.preventDefault()
              for (const file of Array.from(files)) {
                uploadAndInsertRef.current(file, editor)
              }
              return true
            },
          },
        }),
      ]
    },
  })

  // ── Editor instance ───────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'rich-link' } }),
      ImageExt.configure({
        inline: false,
        HTMLAttributes: {
          class: 'editor-image',
          loading: 'lazy',
        },
      }),
      Placeholder.configure({ placeholder }),
      mentionExtension,
      FileHandlerPlugin,
    ],
    content: value || '',
    autofocus: autoFocus,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      onChange(html === '<p></p>' ? '' : html)
    },
  })

  // Sync external value changes (e.g. form reset)
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    const incoming = value || ''
    if (current !== incoming && incoming !== '<p></p>') {
      editor.commands.setContent(incoming, { emitUpdate: false })
    }
  }, [value, editor])

  // ── Link handler ──────────────────────────────
  const handleSetLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href
    const url = window.prompt('Enter URL', prev || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor.chain().focus().setLink({ href: url }).run()
  }, [editor])

  // ── Image button handler ──────────────────────
  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.length || !editor) return
      Array.from(e.target.files).forEach((file) => {
        uploadAndInsert(file, editor)
      })
      e.target.value = ''
    },
    [editor, uploadAndInsert],
  )

  // ── Attachment button handler ─────────────────
  const handleAttachSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.length || !editor) return
      Array.from(e.target.files).forEach((file) => {
        uploadAndInsert(file, editor)
      })
      e.target.value = ''
    },
    [editor, uploadAndInsert],
  )

  // ── Drag-over visual on editor container ──────
  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleContainerDragLeave = useCallback((e: React.DragEvent) => {
    // Only leave if we actually left the container (not entering a child)
    const rect = editorContainerRef.current?.getBoundingClientRect()
    if (rect) {
      const { clientX, clientY } = e
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        setIsDragOver(false)
      }
    }
  }, [])

  const handleContainerDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      if (!editor || !e.dataTransfer.files.length) return
      Array.from(e.dataTransfer.files).forEach((file) => {
        uploadAndInsert(file, editor)
      })
    },
    [editor, uploadAndInsert],
  )

  if (!editor) return null

  const iconSize = 14

  return (
    <div
      ref={editorContainerRef}
      className={cn(
        'relative rounded-md border bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-colors',
        isDragOver
          ? 'border-blue-400 dark:border-blue-500 ring-2 ring-blue-500/20'
          : 'border-gray-300 dark:border-gray-600',
        className,
      )}
      onDragOver={handleContainerDragOver}
      onDragLeave={handleContainerDragLeave}
      onDrop={handleContainerDrop}
    >
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleImageSelect}
      />
      <input
        ref={attachInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleAttachSelect}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 rounded-t-md">
        <ToolbarButton
          title="Bold (Ctrl+B)"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={iconSize} />
        </ToolbarButton>

        <ToolbarButton
          title="Italic (Ctrl+I)"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={iconSize} />
        </ToolbarButton>

        <ToolbarButton
          title="Underline (Ctrl+U)"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={iconSize} />
        </ToolbarButton>

        <ToolbarButton
          title="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={iconSize} />
        </ToolbarButton>

        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />

        <ToolbarButton
          title="Heading"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={iconSize} />
        </ToolbarButton>

        <ToolbarButton
          title="Inline Code"
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code size={iconSize} />
        </ToolbarButton>

        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />

        <ToolbarButton
          title="Bullet List"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={iconSize} />
        </ToolbarButton>

        <ToolbarButton
          title="Numbered List"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={iconSize} />
        </ToolbarButton>

        <ToolbarButton
          title="Blockquote"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={iconSize} />
        </ToolbarButton>

        <ToolbarButton
          title="Horizontal Rule"
          active={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus size={iconSize} />
        </ToolbarButton>

        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />

        <ToolbarButton
          title="Insert Image"
          active={false}
          disabled={uploading > 0}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus size={iconSize} />
        </ToolbarButton>

        <ToolbarButton
          title="Attach File"
          active={false}
          disabled={uploading > 0}
          onClick={() => attachInputRef.current?.click()}
        >
          <Paperclip size={iconSize} />
        </ToolbarButton>

        <ToolbarButton
          title="Link"
          active={editor.isActive('link')}
          onClick={handleSetLink}
        >
          <LinkIcon size={iconSize} />
        </ToolbarButton>

        {/* Upload indicator */}
        {uploading > 0 && (
          <div className="flex items-center gap-1.5 ml-2 text-xs text-blue-600 dark:text-blue-400">
            <Loader2 size={12} className="animate-spin" />
            <span>Uploading{uploading > 1 ? ` (${uploading})` : ''}...</span>
          </div>
        )}
      </div>

      {/* Editor content area */}
      <EditorContent
        editor={editor}
        className="rich-text-editor-content px-3 py-2 focus:outline-none"
        style={{ minHeight }}
      />

      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-blue-50/90 dark:bg-blue-950/80 border-2 border-dashed border-blue-400 dark:border-blue-500 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-blue-600 dark:text-blue-400">
            <ImagePlus size={28} />
            <span className="text-sm font-medium">Drop files to upload</span>
            <span className="text-xs text-blue-500/70">Images, videos, documents — max 50 MB</span>
          </div>
        </div>
      )}

      {/* Mention popup */}
      {mentionPopup.visible && mentionPopup.users.length > 0 && (
        <div
          className="absolute z-50 w-64 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg dark:shadow-black/40"
          style={{
            top: mentionPopup.position.top,
            left: mentionPopup.position.left,
          }}
        >
          {mentionPopup.users.map((user, idx) => (
            <button
              key={user.id}
              type="button"
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors',
                idx === mentionPopup.selectedIndex && 'bg-blue-50 dark:bg-blue-900/30',
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                if (selectMentionRef.current) {
                  selectMentionRef.current(user)
                  setMentionPopup((prev) => ({ ...prev, visible: false }))
                }
              }}
              onMouseEnter={() =>
                setMentionPopup((prev) => ({ ...prev, selectedIndex: idx }))
              }
            >
              <Avatar user={user} size="xs" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                  {user.displayName}
                </div>
                <div className="text-xs text-gray-500 truncate">{user.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
