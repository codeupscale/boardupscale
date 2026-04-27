import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Layers, Users, Clock } from 'lucide-react'
import { Project, ProjectType } from '@/types'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'

interface ProjectCardProps {
  project: Project
  memberCount?: number
  issueCount?: number
  /** Compact row layout for list view */
  listView?: boolean
}

const gradients = [
  'from-blue-500 to-indigo-600',
  'from-purple-500 to-pink-600',
  'from-green-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-purple-600',
]

const accentColors = [
  'from-blue-400 to-indigo-500',
  'from-purple-400 to-pink-500',
  'from-green-400 to-teal-500',
  'from-orange-400 to-red-500',
  'from-cyan-400 to-blue-500',
  'from-violet-400 to-purple-500',
]

function getGradientIndex(key: string): number {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash)
  return Math.abs(hash) % gradients.length
}

function TypeBadge({ type }: { type: ProjectType }) {
  const { t } = useTranslation()
  if (type === ProjectType.SCRUM) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
        {t('projects.scrum')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-teal-500 to-cyan-600 text-white">
      {t('projects.kanban')}
    </span>
  )
}

export function ProjectCard({ project, memberCount, issueCount, listView = false }: ProjectCardProps) {
  const navigate = useNavigate()
  const gradientIdx = getGradientIndex(project.key)
  const gradient = gradients[gradientIdx]
  const accent = accentColors[gradientIdx]

  if (listView) {
    return (
      <div
        role="row"
        onClick={() => navigate(`/projects/${project.key}/board`)}
        className={cn(
          'grid grid-cols-[36px_176px_100px_1fr_140px_88px_160px] items-center px-4 py-3 cursor-pointer transition-colors',
          'hover:bg-primary/5',
          'border-b border-border last:border-0',
        )}
      >
        {/* Avatar */}
        <div
          className={cn(
            'h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-xs bg-gradient-to-br',
            gradient,
          )}
          aria-hidden="true"
        >
          {project.key.slice(0, 2).toUpperCase()}
        </div>

        {/* Name + key */}
        <div className="min-w-0 pr-3">
          <p className="text-sm font-semibold text-foreground truncate hover:text-primary transition-colors">
            {project.name}
          </p>
          <span className="font-mono text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
            {project.key}
          </span>
        </div>

        {/* Type badge */}
        <div className="pr-3">
          <TypeBadge type={project.type} />
        </div>

        {/* Description */}
        <p className="min-w-0 text-sm text-muted-foreground truncate px-3">
          {project.description
            ? project.description
            : <span className="italic">No description</span>}
        </p>

        {/* Issues */}
        <div className="text-xs text-muted-foreground">
          {issueCount !== undefined ? (
            <span className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              {issueCount}
            </span>
          ) : (
            <span className="text-muted-foreground/40">—</span>
          )}
        </div>

        {/* Members */}
        <div className="text-xs text-muted-foreground text-center">
          {memberCount !== undefined ? (
            <span className="flex items-center justify-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {memberCount}
            </span>
          ) : (
            <span className="text-muted-foreground/40">—</span>
          )}
        </div>

        {/* Updated */}
        <div className="text-xs text-muted-foreground text-right">
          <span className="flex items-center justify-end gap-1">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            {formatRelativeTime(project.updatedAt)}
          </span>
        </div>
      </div>
    )
  }

  // Grid card view
  return (
    <div
      role="article"
      onClick={() => navigate(`/projects/${project.key}/board`)}
      className={cn(
        'group relative bg-card rounded-xl border border-border',
        'cursor-pointer overflow-hidden',
        'hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200',
      )}
    >
      {/* Top accent gradient bar */}
      <div className={cn('h-1 w-full bg-gradient-to-r', accent)} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          {/* Project avatar */}
          <div
            className={cn(
              'h-11 w-11 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 bg-gradient-to-br shadow-sm',
              gradient,
            )}
            aria-hidden="true"
          >
            {project.key.slice(0, 2).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors truncate">
              {project.name}
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="font-mono text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                {project.key}
              </span>
              <TypeBadge type={project.type} />
            </div>
          </div>
        </div>

        {/* Description */}
        <p
          className={cn(
            'text-sm text-muted-foreground line-clamp-2 mt-2 min-h-[2.5rem]',
            !project.description && 'italic',
          )}
        >
          {project.description || 'No description provided.'}
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
          {issueCount !== undefined && (
            <span className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              <span>{issueCount} issues</span>
            </span>
          )}
          {memberCount !== undefined && (
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              <span>{memberCount} members</span>
            </span>
          )}
          <span className="flex items-center gap-1 ml-auto">
            <Clock className="h-3.5 w-3.5" />
            <span>{formatRelativeTime(project.updatedAt)}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
