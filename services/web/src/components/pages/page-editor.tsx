import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Mention from '@tiptap/extension-mention'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Extension } from '@tiptap/core'
import { common, createLowlight } from 'lowlight'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { User } from '@/types'
import {
  Bold,
  Italic,
  UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Code,
  Code2,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Minus,
  Link as LinkIcon,
  Table as TableIcon,
  Image as ImageIcon,
} from 'lucide-react'

const lowlight = createLowlight(common)

// ──────────────────────────────────────────────
// Slash Command Extension
// ──────────────────────────────────────────────
interface SlashCommandItem {
  title: string
  description: string
  icon: React.ReactNode
  command: (editor: any) => void
}

function buildSlashItems(editor: any): SlashCommandItem[] {
  return [
    {
      title: 'Heading 1',
      description: 'Big section heading',
      icon: <Heading1 size={16} />,
      command: (ed) => ed.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      title: 'Heading 2',
      description: 'Medium section heading',
      icon: <Heading2 size={16} />,
      command: (ed) => ed.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      title: 'Heading 3',
      description: 'Small section heading',
      icon: <Heading3 size={16} />,
      command: (ed) => ed.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      title: 'Bullet List',
      description: 'Unordered list of items',
      icon: <List size={16} />,
      command: (ed) => ed.chain().focus().toggleBulletList().run(),
    },
    {
      title: 'Numbered List',
      description: 'Ordered list of items',
      icon: <ListOrdered size={16} />,
      command: (ed) => ed.chain().focus().toggleOrderedList().run(),
    },
    {
      title: 'Todo List',
      description: 'Checkboxes for tasks',
      icon: <ListTodo size={16} />,
      command: (ed) => ed.chain().focus().toggleTaskList().run(),
    },
    {
      title: 'Blockquote',
      description: 'Highlighted quote block',
      icon: <Quote size={16} />,
      command: (ed) => ed.chain().focus().toggleBlockquote().run(),
    },
    {
      title: 'Code Block',
      description: 'Syntax highlighted code',
      icon: <Code2 size={16} />,
      command: (ed) => ed.chain().focus().toggleCodeBlock().run(),
    },
    {
      title: 'Table',
      description: '3-column table',
      icon: <TableIcon size={16} />,
      command: (ed) => ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      title: 'Divider',
      description: 'Horizontal separator line',
      icon: <Minus size={16} />,
      command: (ed) => ed.chain().focus().setHorizontalRule().run(),
    },
  ]
}

// ──────────────────────────────────────────────
// Custom Slash Command Extension
// ──────────────────────────────────────────────
const SlashCommandsExtension = (
  setSlashMenu: (v: SlashMenuState) => void,
  slashMenuRef: React.MutableRefObject<SlashMenuState>,
  editorContainerRef: React.MutableRefObject<HTMLDivElement | null>,
) =>
  Extension.create({
    name: 'slashCommands',
    addKeyboardShortcuts() {
      return {
        '/': () => {
          // Just let the character be typed; we detect it via onUpdate
          return false
        },
      }
    },
  })

interface SlashMenuState {
  visible: boolean
  query: string
  selectedIndex: number
  position: { top: number; left: number }
  from: number
}

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
        'p-1.5 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors',
        active && 'bg-accent text-foreground',
      )}
    >
      {children}
    </button>
  )
}

// ──────────────────────────────────────────────
// Main PageEditor component
// ──────────────────────────────────────────────
interface PageEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  users?: User[]
  autoFocus?: boolean
  className?: string
  onImageUpload?: (file: File) => Promise<string>
}

export function PageEditor({
  value,
  onChange,
  placeholder = "Start writing... type '/' for commands",
  users = [],
  autoFocus = false,
  className,
  onImageUpload,
}: PageEditorProps) {
  // ── Mention state ─────────────────────────────
  const [mentionPopup, setMentionPopup] = useState<{
    visible: boolean
    users: User[]
    selectedIndex: number
    position: { top: number; left: number }
  }>({ visible: false, users: [], selectedIndex: 0, position: { top: 0, left: 0 } })
  const mentionPopupRef = useRef(mentionPopup)
  mentionPopupRef.current = mentionPopup
  const selectMentionRef = useRef<((user: User) => void) | null>(null)

  // ── Slash menu state ──────────────────────────
  const [slashMenu, setSlashMenu] = useState<SlashMenuState>({
    visible: false,
    query: '',
    selectedIndex: 0,
    position: { top: 0, left: 0 },
    from: 0,
  })
  const slashMenuRef = useRef(slashMenu)
  slashMenuRef.current = slashMenu

  const editorContainerRef = useRef<HTMLDivElement>(null)
  const usersRef = useRef(users)
  usersRef.current = users

  // ── Build mention extension ───────────────────
  const mentionExtension = Mention.configure({
    HTMLAttributes: { class: 'mention' },
    suggestion: {
      items: ({ query }: { query: string }) => {
        if (!usersRef.current.length) return []
        const q = query.toLowerCase()
        return usersRef.current
          .filter((u) => u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
          .slice(0, 8)
      },
      render: () => ({
        onStart: (props: any) => {
          const filteredUsers = props.items as User[]
          const rect = props.clientRect?.()
          const containerRect = editorContainerRef.current?.getBoundingClientRect()
          setMentionPopup({
            visible: true,
            users: filteredUsers,
            selectedIndex: 0,
            position: rect && containerRect
              ? { top: rect.bottom - containerRect.top + 4, left: rect.left - containerRect.left }
              : { top: 0, left: 0 },
          })
          selectMentionRef.current = (user) => props.command({ id: user.id, label: user.displayName })
        },
        onUpdate: (props: any) => {
          const filteredUsers = props.items as User[]
          const rect = props.clientRect?.()
          const containerRect = editorContainerRef.current?.getBoundingClientRect()
          setMentionPopup((prev) => ({
            ...prev,
            users: filteredUsers,
            selectedIndex: 0,
            position: rect && containerRect
              ? { top: rect.bottom - containerRect.top + 4, left: rect.left - containerRect.left }
              : prev.position,
          }))
          selectMentionRef.current = (user) => props.command({ id: user.id, label: user.displayName })
        },
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
          const popup = mentionPopupRef.current
          if (!popup.visible || !popup.users.length) return false
          if (event.key === 'ArrowDown') {
            setMentionPopup((prev) => ({ ...prev, selectedIndex: (prev.selectedIndex + 1) % prev.users.length }))
            return true
          }
          if (event.key === 'ArrowUp') {
            setMentionPopup((prev) => ({ ...prev, selectedIndex: (prev.selectedIndex - 1 + prev.users.length) % prev.users.length }))
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
      }),
    },
  })

  // ── Editor ────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'rich-link' } }),
      Placeholder.configure({ placeholder }),
      mentionExtension,
      Image.configure({ HTMLAttributes: { class: 'page-image' } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content: value || '',
    autofocus: autoFocus,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      onChange(html === '<p></p>' ? '' : html)

      // Detect slash command: look for '/' at start of empty line
      const { state } = ed
      const { from } = state.selection
      const textBefore = state.doc.textBetween(Math.max(0, from - 50), from, '\n', '\0')
      const slashMatch = textBefore.match(/(?:^|\n)\/([^\s]*)$/)

      if (slashMatch) {
        const query = slashMatch[1] || ''
        const selection = window.getSelection()
        const range = selection?.getRangeAt(0)
        const rect = range?.getBoundingClientRect()
        const containerRect = editorContainerRef.current?.getBoundingClientRect()

        setSlashMenu({
          visible: true,
          query,
          selectedIndex: 0,
          position: rect && containerRect
            ? { top: rect.bottom - containerRect.top + 4, left: rect.left - containerRect.left }
            : { top: 0, left: 0 },
          from: from - 1 - query.length, // position of the '/'
        })
      } else {
        setSlashMenu((prev) => prev.visible ? { ...prev, visible: false } : prev)
      }
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        const menu = slashMenuRef.current
        if (!menu.visible) return false

        const items = buildSlashItems(null).filter((item) =>
          item.title.toLowerCase().includes(menu.query.toLowerCase())
        )

        if (event.key === 'ArrowDown') {
          setSlashMenu((prev) => ({ ...prev, selectedIndex: (prev.selectedIndex + 1) % Math.max(items.length, 1) }))
          return true
        }
        if (event.key === 'ArrowUp') {
          setSlashMenu((prev) => ({ ...prev, selectedIndex: (prev.selectedIndex - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1) }))
          return true
        }
        if (event.key === 'Enter') {
          const item = items[menu.selectedIndex]
          if (item && editorRef.current) {
            // Delete the slash + query text
            editorRef.current.chain().focus().deleteRange({ from: menu.from, to: menu.from + 1 + menu.query.length }).run()
            item.command(editorRef.current)
            setSlashMenu((prev) => ({ ...prev, visible: false }))
          }
          return true
        }
        if (event.key === 'Escape') {
          setSlashMenu((prev) => ({ ...prev, visible: false }))
          return true
        }
        return false
      },
    },
  })

  const editorRef = useRef(editor)
  editorRef.current = editor

  // Sync external value changes
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    const incoming = value || ''
    if (current !== incoming && incoming !== '<p></p>') {
      editor.commands.setContent(incoming, { emitUpdate: false })
    }
  }, [value, editor])

  const handleSetLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href
    const url = window.prompt('Enter URL', prev || 'https://')
    if (url === null) return
    if (!url) { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url }).run()
  }, [editor])

  const handleImageUpload = useCallback(async () => {
    if (!editor || !onImageUpload) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const url = await onImageUpload(file)
        editor.chain().focus().setImage({ src: url }).run()
      } catch {
        // silently ignore upload errors
      }
    }
    input.click()
  }, [editor, onImageUpload])

  if (!editor) return null

  const iconSize = 14
  const slashItems = buildSlashItems(editor).filter((item) =>
    item.title.toLowerCase().includes(slashMenu.query.toLowerCase())
  )

  return (
    <div ref={editorContainerRef} className={cn('relative', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted rounded-t-md sticky top-0 z-10">
        <ToolbarButton title="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={iconSize} />
        </ToolbarButton>
        <ToolbarButton title="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={iconSize} />
        </ToolbarButton>
        <ToolbarButton title="Underline (Ctrl+U)" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon size={iconSize} />
        </ToolbarButton>
        <ToolbarButton title="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough size={iconSize} />
        </ToolbarButton>

        <div className="w-px h-4 bg-border mx-1" />

        <ToolbarButton title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 size={iconSize} />
        </ToolbarButton>
        <ToolbarButton title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={iconSize} />
        </ToolbarButton>
        <ToolbarButton title="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 size={iconSize} />
        </ToolbarButton>

        <div className="w-px h-4 bg-border mx-1" />

        <ToolbarButton title="Bullet List" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={iconSize} />
        </ToolbarButton>
        <ToolbarButton title="Numbered List" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={iconSize} />
        </ToolbarButton>
        <ToolbarButton title="Todo List" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <ListTodo size={iconSize} />
        </ToolbarButton>
        <ToolbarButton title="Blockquote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={iconSize} />
        </ToolbarButton>
        <ToolbarButton title="Code Block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <Code2 size={iconSize} />
        </ToolbarButton>
        <ToolbarButton title="Inline Code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code size={iconSize} />
        </ToolbarButton>

        <div className="w-px h-4 bg-border mx-1" />

        <ToolbarButton title="Table" active={editor.isActive('table')} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <TableIcon size={iconSize} />
        </ToolbarButton>
        <ToolbarButton title="Link" active={editor.isActive('link')} onClick={handleSetLink}>
          <LinkIcon size={iconSize} />
        </ToolbarButton>
        <ToolbarButton title="Horizontal Rule" active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus size={iconSize} />
        </ToolbarButton>

        {onImageUpload && (
          <ToolbarButton title="Insert Image" active={false} onClick={handleImageUpload}>
            <ImageIcon size={iconSize} />
          </ToolbarButton>
        )}
      </div>

      {/* Editor content */}
      <EditorContent
        editor={editor}
        className="page-editor-content px-6 py-4 focus:outline-none min-h-[400px] prose prose-sm dark:prose-invert max-w-none"
      />

      {/* Slash command menu */}
      {slashMenu.visible && slashItems.length > 0 && (
        <div
          className="absolute z-50 w-64 max-h-72 overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
          style={{ top: slashMenu.position.top, left: slashMenu.position.left }}
        >
          <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border">
            Insert block
          </div>
          {slashItems.map((item, idx) => (
            <button
              key={item.title}
              type="button"
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors',
                idx === slashMenu.selectedIndex && 'bg-accent',
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                editor.chain().focus().deleteRange({ from: slashMenu.from, to: slashMenu.from + 1 + slashMenu.query.length }).run()
                item.command(editor)
                setSlashMenu((prev) => ({ ...prev, visible: false }))
              }}
              onMouseEnter={() => setSlashMenu((prev) => ({ ...prev, selectedIndex: idx }))}
            >
              <span className="text-muted-foreground flex-shrink-0">{item.icon}</span>
              <div>
                <div className="font-medium text-foreground">{item.title}</div>
                <div className="text-xs text-muted-foreground">{item.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Mention popup */}
      {mentionPopup.visible && mentionPopup.users.length > 0 && (
        <div
          className="absolute z-50 w-64 max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
          style={{ top: mentionPopup.position.top, left: mentionPopup.position.left }}
        >
          {mentionPopup.users.map((user, idx) => (
            <button
              key={user.id}
              type="button"
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-primary/10 transition-colors',
                idx === mentionPopup.selectedIndex && 'bg-primary/10',
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                if (selectMentionRef.current) {
                  selectMentionRef.current(user)
                  setMentionPopup((prev) => ({ ...prev, visible: false }))
                }
              }}
              onMouseEnter={() => setMentionPopup((prev) => ({ ...prev, selectedIndex: idx }))}
            >
              <Avatar user={user} size="xs" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground truncate">{user.displayName}</div>
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
