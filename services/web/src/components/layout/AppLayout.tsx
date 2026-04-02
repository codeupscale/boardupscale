import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import { useMe } from '@/hooks/useAuth'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { useUiStore, toast } from '@/store/ui.store'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { ToastContainer } from '@/components/ui/toast'
import { CommandPalette } from './command-palette'
import { ProjectChat } from '@/components/chat/ProjectChat'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const { initialize, isAuthenticated, setUser } = useAuthStore()
  const { isSidebarOpen } = useUiStore()
  const navigate = useNavigate()

  useEffect(() => {
    initialize()
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const { data: user } = useMe()
  useEffect(() => {
    if (user) setUser(user)
  }, [user, setUser])

  const qc = useQueryClient()

  useEffect(() => {
    if (!isAuthenticated) return
    const socket = getSocket()

    socket.on('notification:new', (notification: any) => {
      qc.invalidateQueries({ queryKey: ['unread-count'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
      if (notification?.title) {
        toast(notification.title, 'info')
      }
    })

    return () => {
      socket.off('notification:new')
      disconnectSocket()
    }
  }, [isAuthenticated, qc])

  if (!isAuthenticated) return null

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white dark:focus:bg-gray-900 focus:text-blue-600 focus:rounded focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        Skip to main content
      </a>
      <Sidebar />
      <div
        className="flex-1 flex flex-col min-w-0 transition-all duration-200"
      >
        <Topbar />
        <main id="main-content" className="flex-1 overflow-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <ToastContainer />
      <CommandPalette />
      <ProjectChat />
    </div>
  )
}
