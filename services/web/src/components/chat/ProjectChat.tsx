import { useLocation } from 'react-router-dom'
import { useProject } from '@/hooks/useProjects'
import { ChatToggleButton } from './ChatToggleButton'
import { ChatPanel } from './ChatPanel'

export function ProjectChat() {
  const { pathname } = useLocation()

  // Extract project key from URL: /projects/:key/...
  const match = pathname.match(/^\/projects\/([^/]+)/)
  const projectKey = match?.[1]

  const { data: project } = useProject(projectKey || '')

  if (!projectKey || !project) return null

  return (
    <>
      <ChatToggleButton />
      <ChatPanel projectId={project.id} />
    </>
  )
}
