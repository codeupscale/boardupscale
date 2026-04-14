import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  ChevronRight,
  FileText,
  Plus,
  MoreHorizontal,
  Trash2,
  Edit3,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

export interface PageTreeNode {
  id: string
  title: string
  icon: string | null
  status: string
  position: number
  parentPageId: string | null
  children: PageTreeNode[]
}

interface PageTreeItemProps {
  node: PageTreeNode
  depth: number
  activePageId?: string
  projectKey: string
  onCreateChild: (parentId: string) => void
  onDelete: (id: string, title: string) => void
}

function PageTreeItem({
  node,
  depth,
  activePageId,
  projectKey,
  onCreateChild,
  onDelete,
}: PageTreeItemProps) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0
  const isActive = activePageId === node.id

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer text-sm transition-colors select-none',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'hover:bg-accent text-foreground/80',
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => navigate(`/projects/${projectKey}/pages/${node.id}`)}
      >
        {/* Expand/collapse toggle */}
        <button
          type="button"
          className={cn(
            'flex-shrink-0 p-0.5 rounded hover:bg-accent transition-colors',
            !hasChildren && 'invisible',
          )}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
        >
          <ChevronRight
            size={12}
            className={cn('transition-transform duration-150', expanded && 'rotate-90')}
          />
        </button>

        {/* Icon + title */}
        <span className="flex-shrink-0 text-base leading-none">
          {node.icon ? node.icon : <FileText size={14} className="text-muted-foreground" />}
        </span>
        <span className="flex-1 truncate">{node.title || 'Untitled'}</span>

        {/* Action buttons (visible on hover) */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            title="Add sub-page"
            className="p-0.5 rounded hover:bg-accent text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation()
              onCreateChild(node.id)
            }}
          >
            <Plus size={12} />
          </button>

          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-0.5 rounded hover:bg-accent text-muted-foreground"
                >
                  <MoreHorizontal size={12} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/projects/${projectKey}/pages/${node.id}`)}>
                  <Edit3 size={14} />
                  Open
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  onClick={() => onDelete(node.id, node.title)}
                >
                  <Trash2 size={14} />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <PageTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              activePageId={activePageId}
              projectKey={projectKey}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface PageTreeProps {
  pages: PageTreeNode[]
  activePageId?: string
  projectKey: string
  onCreatePage: (parentId?: string) => void
  onDeletePage: (id: string, title: string) => void
  loading?: boolean
}

export function PageTree({
  pages,
  activePageId,
  projectKey,
  onCreatePage,
  onDeletePage,
  loading,
}: PageTreeProps) {
  if (loading) {
    return (
      <div className="p-3 space-y-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-7 bg-muted rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="py-1">
      {pages.length === 0 ? (
        <div className="px-4 py-3 text-xs text-muted-foreground italic">
          No pages yet
        </div>
      ) : (
        pages.map((node) => (
          <PageTreeItem
            key={node.id}
            node={node}
            depth={0}
            activePageId={activePageId}
            projectKey={projectKey}
            onCreateChild={(parentId) => onCreatePage(parentId)}
            onDelete={onDeletePage}
          />
        ))
      )}

      {/* Add root page button */}
      <button
        type="button"
        onClick={() => onCreatePage()}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors mt-1"
      >
        <Plus size={12} />
        Add page
      </button>
    </div>
  )
}
