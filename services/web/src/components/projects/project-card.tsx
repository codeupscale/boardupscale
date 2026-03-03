import { useNavigate } from 'react-router-dom'
import { Project, ProjectType } from '@/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Users, Layers } from 'lucide-react'

interface ProjectCardProps {
  project: Project
  memberCount?: number
  issueCount?: number
}

const typeColors: Record<ProjectType, string> = {
  [ProjectType.SCRUM]: 'bg-purple-100 text-purple-700',
  [ProjectType.KANBAN]: 'bg-teal-100 text-teal-700',
}

const projectColors = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-green-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-red-500',
]

function getProjectColor(key: string) {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash)
  return projectColors[Math.abs(hash) % projectColors.length]
}

export function ProjectCard({ project, memberCount, issueCount }: ProjectCardProps) {
  const navigate = useNavigate()
  const colorClass = getProjectColor(project.key)

  return (
    <div
      onClick={() => navigate(`/projects/${project.id}/board`)}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all group"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className={cn(
            'h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0',
            colorClass,
          )}
        >
          {project.key.slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors truncate">
            {project.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono text-gray-400">{project.key}</span>
            <span
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
                typeColors[project.type],
              )}
            >
              {project.type === ProjectType.SCRUM ? 'Scrum' : 'Kanban'}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-sm text-gray-500 line-clamp-2 mb-4">{project.description}</p>
      )}

      {/* Footer stats */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        {memberCount !== undefined && (
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {memberCount} member{memberCount !== 1 ? 's' : ''}
          </span>
        )}
        {issueCount !== undefined && (
          <span className="flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" />
            {issueCount} issue{issueCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  )
}
