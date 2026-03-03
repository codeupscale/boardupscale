import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { useMe } from '@/hooks/useAuth'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { useUiStore } from '@/store/ui.store'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { ToastContainer } from '@/components/ui/toast'
import { SearchModal } from './search-modal'
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

  useEffect(() => {
    if (!isAuthenticated) return
    const socket = getSocket()
    return () => {
      disconnectSocket()
    }
  }, [isAuthenticated])

  if (!isAuthenticated) return null

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <div
        className={cn(
          'flex-1 flex flex-col min-w-0 transition-all duration-200',
          isSidebarOpen ? 'ml-60' : 'ml-16',
        )}
      >
        <Topbar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
      <SearchModal />
    </div>
  )
}
