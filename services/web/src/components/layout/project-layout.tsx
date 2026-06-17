import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useProject } from '@/hooks/useProjects'

/**
 * Layout wrapper for all /projects/:key/* routes.
 * Once the project is loaded, replaces the URL segment with the canonical key
 * from the API (single source of truth). Old keys still resolve via backend aliases.
 */
export function ProjectLayout() {
  const { key: urlKey } = useParams<{ key: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { data: project } = useProject(urlKey!)

  useEffect(() => {
    if (!project || !urlKey) return
    const canonical = project.key
    if (canonical.toUpperCase() !== urlKey.toUpperCase()) {
      const newPath = location.pathname.replace(
        `/projects/${urlKey}`,
        `/projects/${canonical}`,
      )
      navigate(`${newPath}${location.search}${location.hash}`, { replace: true })
    }
  }, [project, urlKey, location.pathname, location.search, location.hash, navigate])

  return <Outlet />
}
