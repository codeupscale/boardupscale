import { Link } from 'react-router-dom'
import { ShieldX, Loader2, FolderSearch, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useHasPermission } from '@/hooks/useHasPermission'
import { useProject } from '@/hooks/useProjects'
import { getApiErrorMessage, isApiNotFound } from '@/lib/api-errors'
import { useAuthStore } from '@/store/auth.store'
import { UserRole } from '@/types'
import { Button } from '@/components/ui/button'

interface ProjectMemberGuardProps {
  /** Project key (slug) from the URL, e.g. "MY-PROJ" */
  projectKey: string
  children: React.ReactNode
}

/**
 * Guards project content pages.
 *
 * CSV "Enter without membership": Owner ✅ / Admin ✅ / Member — / Viewer —
 *
 * - Resolves the project first: unknown keys show "project not found".
 * - Owner & Admin pass through once the project exists.
 * - Member & Viewer must be explicitly added to the project.
 */
export function ProjectMemberGuard({ projectKey, children }: ProjectMemberGuardProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isOrgAdmin = user?.role === UserRole.OWNER || user?.role === UserRole.ADMINISTRATOR

  const {
    data: project,
    isLoading: projectLoading,
    isError: projectError,
    error: projectFetchError,
    refetch: refetchProject,
    isFetching: projectRefetching,
  } = useProject(projectKey)

  const { hasPermission, isLoading: permissionsLoading } = useHasPermission(projectKey, {
    enabled: !isOrgAdmin && !!project,
  })

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (projectError) {
    if (isApiNotFound(projectFetchError)) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-4">
          <FolderSearch className="h-10 w-10 text-muted-foreground" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">{t('projects.projectNotFound')}</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              {t('projects.projectNotFoundDesc', { key: projectKey })}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/projects">{t('projects.viewAllProjects')}</Link>
          </Button>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-4">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">{t('projects.projectLoadError')}</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            {getApiErrorMessage(projectFetchError, t('projects.projectLoadErrorDesc'))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            isLoading={projectRefetching}
            onClick={() => {
              void qc.invalidateQueries({ queryKey: ['project', projectKey] })
              void refetchProject()
            }}
          >
            {t('common.retry')}
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/projects">{t('projects.viewAllProjects')}</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (isOrgAdmin) return <>{children}</>

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!hasPermission('board', 'read')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
        <ShieldX className="h-10 w-10 text-muted-foreground" />
        <p className="font-medium text-foreground">{t('projects.notProjectMember')}</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          {t('projects.notProjectMemberDesc')}
        </p>
      </div>
    )
  }

  return <>{children}</>
}
