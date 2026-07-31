import { FolderKanban, RotateCw } from 'lucide-react'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { MemberScopedProject } from '@/hooks/useMemberDashboard'

const ALL_PROJECTS_VALUE = 'all'
const DEFAULT_TRIGGER_CLASSNAME = 'h-7 w-[150px] shrink-0 gap-1 px-2 text-xs'

interface ProjectFilterSelectProps {
  projects: MemberScopedProject[]
  value: string | undefined
  onChange: (projectId: string | undefined) => void
  isLoading?: boolean
  /** True if the project list failed to load — renders a retry affordance instead of the dropdown. */
  isError?: boolean
  onRetry?: () => void
  /** Accessible label — should name the specific widget this filter scopes (e.g. "Filter Team Workload by project"). */
  label: string
  className?: string
}

/**
 * Per-widget project filter — narrows a single dashboard widget to one
 * project the caller owns or is a member of. Each dashboard widget renders
 * its own instance so widgets filter independently of one another.
 * `value`/`onChange` use undefined for "All Projects".
 */
export function ProjectFilterSelect({
  projects,
  value,
  onChange,
  isLoading,
  isError,
  onRetry,
  label,
  className,
}: ProjectFilterSelectProps) {
  if (isError) {
    return (
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          className ?? DEFAULT_TRIGGER_CLASSNAME,
          'flex items-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:text-foreground',
        )}
        aria-label={`${label} — failed to load, click to retry`}
      >
        <RotateCw className="h-3 w-3 shrink-0" />
        <span className="truncate">Couldn't load</span>
      </button>
    )
  }

  return (
    <Select
      value={value ?? ALL_PROJECTS_VALUE}
      onValueChange={(next) =>
        onChange(next === ALL_PROJECTS_VALUE ? undefined : next)
      }
      disabled={isLoading}
    >
      <SelectTrigger
        className={className ?? DEFAULT_TRIGGER_CLASSNAME}
        aria-label={label}
      >
        <FolderKanban className="h-3 w-3 shrink-0 text-muted-foreground" />
        <SelectValue placeholder={isLoading ? 'Loading...' : 'All Projects'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PROJECTS_VALUE}>All Projects</SelectItem>
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            {project.name} ({project.key})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
