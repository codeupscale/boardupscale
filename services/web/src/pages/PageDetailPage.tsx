import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { usePage, usePageAncestors, usePageTree, useUpdatePage, useCreatePage, useDeletePage } from '@/hooks/usePages'
import { useProjects } from '@/hooks/useProjects'
import { useUsers } from '@/hooks/useUsers'
import { PageTree } from '@/components/pages/page-tree'
import { PageEditor } from '@/components/pages/page-editor'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import {
  BookOpen,
  ChevronRight,
  Plus,
  Trash2,
  Clock,
  MoreHorizontal,
  Check,
} from 'lucide-react'
import { DropdownMenu, DropdownItem } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

// Common emoji choices for page icons
const EMOJI_PICKS = ['📄', '📝', '📋', '📌', '🗒️', '🗂️', '📁', '💡', '🚀', '⚙️', '🔧', '🐛', '✅', '📊', '🎯', '🔖']

export function PageDetailPage() {
  const { key, pageId } = useParams<{ key: string; pageId: string }>()
  const navigate = useNavigate()

  const { data: projects } = useProjects()
  const project = projects?.find((p) => p.key === key)

  const { data: page, isLoading: pageLoading } = usePage(pageId)
  const { data: ancestors = [] } = usePageAncestors(pageId)
  const { data: pageTree = [], isLoading: treeLoading } = usePageTree(project?.id)
  const { data: orgUsers = [] } = useUsers()

  const updatePage = useUpdatePage()
  const createPage = useCreatePage()
  const deletePage = useDeletePage()

  // ── Controlled title + content ─────────────────────────────────────────────
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')

  // Populate from fetched page
  useEffect(() => {
    if (page) {
      setTitle(page.title)
      setContent(page.content || '')
    }
  }, [page?.id]) // only reset on page change, not on every update

  // ── Auto-save with debounce ────────────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleSave = useCallback(
    (newTitle: string, newContent: string) => {
      if (!pageId || !project) return
      setSaveStatus('unsaved')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        setSaveStatus('saving')
        try {
          await updatePage.mutateAsync({
            id: pageId,
            payload: { title: newTitle, content: newContent },
          })
          setSaveStatus('saved')
        } catch {
          setSaveStatus('unsaved')
        }
      }, 600)
    },
    [pageId, project, updatePage],
  )

  // Cleanup on unmount
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  const handleTitleChange = (val: string) => {
    setTitle(val)
    scheduleSave(val, content)
  }

  const handleContentChange = (val: string) => {
    setContent(val)
    scheduleSave(title, val)
  }

  const handleIconSelect = async (emoji: string) => {
    if (!pageId || !project) return
    setShowEmojiPicker(false)
    await updatePage.mutateAsync({ id: pageId, payload: { icon: emoji } })
  }

  // ── Sidebar create / delete ────────────────────────────────────────────────
  async function handleCreatePage(parentId?: string) {
    if (!project) return
    const created = await createPage.mutateAsync({
      projectId: project.id,
      parentPageId: parentId,
      title: 'Untitled',
      content: '',
    })
    navigate(`/projects/${key}/pages/${created.id}`)
  }

  async function handleDeletePage(id: string, ttl: string) {
    if (!project) return
    if (!confirm(`Delete "${ttl}" and all its sub-pages? This cannot be undone.`)) return
    await deletePage.mutateAsync({ id, projectId: project.id })
    if (id === pageId) navigate(`/projects/${key}/pages`)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Loading page…</div>
      </div>
    )
  }

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-3">Page not found.</p>
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${key}/pages`)}>
            Back to Pages
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Sidebar ── */}
      <div className="w-60 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            <BookOpen size={15} />
            Pages
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => handleCreatePage()}
            title="New page"
          >
            <Plus size={14} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          <PageTree
            pages={pageTree}
            activePageId={pageId}
            projectKey={key || ''}
            onCreatePage={handleCreatePage}
            onDeletePage={handleDeletePage}
            loading={treeLoading}
          />
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-gray-900">
        {/* Top bar — breadcrumb + actions */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 min-w-0">
            <Link
              to={`/projects/${key}/pages`}
              className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex-shrink-0"
            >
              Pages
            </Link>
            {ancestors.slice(0, -1).map((a) => (
              <span key={a.id} className="flex items-center gap-1 min-w-0">
                <ChevronRight size={10} className="flex-shrink-0" />
                <Link
                  to={`/projects/${key}/pages/${a.id}`}
                  className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors truncate max-w-[120px]"
                >
                  {a.title}
                </Link>
              </span>
            ))}
            <span className="flex items-center gap-1 min-w-0">
              <ChevronRight size={10} className="flex-shrink-0" />
              <span className="text-gray-700 dark:text-gray-200 font-medium truncate max-w-[160px]">
                {title || 'Untitled'}
              </span>
            </span>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Save indicator */}
            <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              {saveStatus === 'saving' && (
                <>
                  <div className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin" />
                  Saving…
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <Check size={11} className="text-green-500" />
                  Saved
                </>
              )}
            </div>

            {/* Last edited */}
            {page.lastEditor && (
              <div className="hidden sm:flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                <Clock size={11} />
                <Avatar user={page.lastEditor as any} size="xs" />
                <span>{formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })}</span>
              </div>
            )}

            {/* More actions */}
            <DropdownMenu
              align="right"
              trigger={
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreHorizontal size={14} />
                </Button>
              }
            >
              <DropdownItem icon={<Plus size={14} />} onClick={() => handleCreatePage(pageId)}>
                Add sub-page
              </DropdownItem>
              <DropdownItem icon={<Trash2 size={14} />} destructive onClick={() => handleDeletePage(page.id, page.title)}>
                Delete page
              </DropdownItem>
            </DropdownMenu>
          </div>
        </div>

        {/* Page content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8">
            {/* Cover image (optional) */}
            {page.coverImageUrl && (
              <div className="w-full h-36 rounded-lg overflow-hidden mb-6">
                <img src={page.coverImageUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}

            {/* Icon + title */}
            <div className="mb-6">
              {/* Emoji icon picker */}
              <div className="relative mb-2">
                <button
                  type="button"
                  className="text-4xl hover:opacity-80 transition-opacity cursor-pointer"
                  title="Change icon"
                  onClick={() => setShowEmojiPicker((v) => !v)}
                >
                  {page.icon || '📄'}
                </button>

                {showEmojiPicker && (
                  <div className="absolute top-12 left-0 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 w-64">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">Choose an icon</div>
                    <div className="grid grid-cols-8 gap-1">
                      {EMOJI_PICKS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className={cn(
                            'text-xl p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                            page.icon === emoji && 'bg-blue-50 dark:bg-blue-900/20',
                          )}
                          onClick={() => handleIconSelect(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="mt-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      onClick={() => handleIconSelect('')}
                    >
                      Remove icon
                    </button>
                  </div>
                )}
              </div>

              {/* Large title input */}
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Untitled"
                className="w-full text-3xl font-bold text-gray-900 dark:text-gray-100 bg-transparent border-none outline-none placeholder-gray-300 dark:placeholder-gray-600 resize-none"
              />
            </div>

            {/* Rich text editor */}
            <PageEditor
              value={content}
              onChange={handleContentChange}
              users={orgUsers || []}
              autoFocus={false}
              className="border-none shadow-none"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
