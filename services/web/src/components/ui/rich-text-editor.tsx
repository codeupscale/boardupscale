import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Mention from '@tiptap/extension-mention'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
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
} from 'lucide-react'

// ──────────────────────────────────────────────
// Toolbar button
// ──────────────────────────────────────────────
function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      className={cn(
        'p-1.5 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 transition-colors',
        active && 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100',
      )}
    >
      {children}
    </button>
  )
}

// ──────────────────────────────────────────────
// Mention popup
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
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write something…',
  users = [],
  minHeight = 120,
  autoFocus = false,
  className,
}: RichTextEditorProps) {
  // ── Mention popup state ───────────────────────
  const [mentionPopup, setMentionPopup] = useState<MentionPopupState>({
    visible: false,
    users: [],
    selectedIndex: 0,
    position: { top: 0, left: 0 },
  })

  // Refs so TipTap's synchronous suggestion callbacks can read/write state
  const mentionPopupRef = useRef(mentionPopup)
  mentionPopupRef.current = mentionPopup

  // Callback ref injected by the Mention extension
  const selectMentionRef = useRef<((user: User) => void) | null>(null)

  const editorContainerRef = useRef<HTMLDivElement>(null)

  // Keep users in a ref so the mention extension always reads fresh data
  // even after async load (useEditor only runs once at mount)
  const usersRef = useRef(users)
  usersRef.current = users

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

  // ── Editor instance ───────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'rich-link' } }),
      Placeholder.configure({ placeholder }),
      mentionExtension,
    ],
    content: value || '',
    autofocus: autoFocus,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      // Treat empty editor as empty string
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

  if (!editor) return null

  const iconSize = 14

  return (
    <div
      ref={editorContainerRef}
      className={cn(
        'relative rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent',
        className,
      )}
    >
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
          title="Link"
          active={editor.isActive('link')}
          onClick={handleSetLink}
        >
          <LinkIcon size={iconSize} />
        </ToolbarButton>
      </div>

      {/* Editor content area */}
      <EditorContent
        editor={editor}
        className="rich-text-editor-content px-3 py-2 focus:outline-none"
        style={{ minHeight }}
      />

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
