import { Menu, Search, Bell, User, Settings, LogOut } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useUnreadCount } from '@/hooks/useNotifications'
import { useLogout } from '@/hooks/useAuth'
import { Avatar } from '@/components/ui/avatar'
import { DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export function Topbar() {
  const { toggleSidebar, setSearchOpen } = useUiStore()
  const user = useAuthStore((s) => s.user)
  const { data: unreadData } = useUnreadCount()
  const logout = useLogout()
  const unreadCount = unreadData?.count || 0

  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-4 gap-4 flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-white border border-gray-300 rounded font-mono">
            ⌘K
          </kbd>
        </button>

        {/* Notifications */}
        <Link
          to="/notifications"
          className="relative p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 flex items-center justify-center bg-red-500 text-white text-xs rounded-full font-medium">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* User dropdown */}
        <DropdownMenu
          trigger={
            <button className="flex items-center gap-2 rounded-lg p-1 hover:bg-gray-100 transition-colors">
              <Avatar user={user || undefined} size="sm" />
            </button>
          }
        >
          {user && (
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900">{user.displayName}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
          )}
          <DropdownItem
            icon={<User className="h-4 w-4" />}
            onClick={() => (window.location.href = '/settings')}
          >
            Profile
          </DropdownItem>
          <DropdownItem
            icon={<Settings className="h-4 w-4" />}
            onClick={() => (window.location.href = '/settings')}
          >
            Settings
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem
            icon={<LogOut className="h-4 w-4" />}
            destructive
            onClick={() => logout.mutate()}
          >
            Log out
          </DropdownItem>
        </DropdownMenu>
      </div>
    </header>
  )
}
