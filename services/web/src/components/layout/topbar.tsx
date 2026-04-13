import { Menu, Search, Bell, User, Settings, LogOut, Globe, Sun, Moon, Monitor } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useThemeStore } from '@/store/theme.store'
import { useUnreadCount } from '@/hooks/useNotifications'
import { useLogout } from '@/hooks/useAuth'
import { Avatar } from '@/components/ui/avatar'
import { DropdownMenu, DropdownItem, DropdownSeparator, DropdownLabel } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Espanol' },
  { code: 'fr', label: 'Francais' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ja', label: 'Japanese' },
]

export function Topbar() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { toggleSidebar, setSearchOpen } = useUiStore()
  const user = useAuthStore((s) => s.user)
  const { theme, setTheme } = useThemeStore()
  const { data: unreadData } = useUnreadCount()
  const logout = useLogout()
  const unreadCount = unreadData?.count || 0

  const themeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <header className="h-14 border-b border-[var(--plasma-border)] bg-white/80 dark:bg-[color-mix(in_srgb,var(--plasma-surface)_80%,transparent)] backdrop-blur-md flex items-center justify-between px-4 gap-4 flex-shrink-0 sticky top-0 z-20">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          aria-label="Toggle menu"
          className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-[var(--plasma-hover)] hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1.5">
        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          aria-label="Search (Cmd+K)"
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 bg-[var(--plasma-surface-raised)] hover:bg-[var(--plasma-hover)] rounded-xl transition-colors border border-[var(--plasma-border)]"
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">{t('common.search')}</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-white dark:bg-[var(--plasma-surface)] border border-[var(--plasma-border)] rounded-md font-mono text-gray-400 dark:text-gray-500">
            ⌘K
          </kbd>
        </button>

        {/* Theme Switcher */}
        <DropdownMenu
          trigger={
            <button
              aria-label="Switch theme"
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-[var(--plasma-hover)] hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              {(() => {
                const Icon = themeIcon
                return <Icon className="h-5 w-5" />
              })()}
            </button>
          }
        >
          <DropdownLabel>Theme</DropdownLabel>
          <DropdownItem
            icon={<Sun className="h-4 w-4" />}
            onClick={() => setTheme('light')}
          >
            <span className={cn('text-sm', theme === 'light' && 'font-semibold text-blue-600 dark:text-blue-400')}>
              Light
            </span>
          </DropdownItem>
          <DropdownItem
            icon={<Moon className="h-4 w-4" />}
            onClick={() => setTheme('dark')}
          >
            <span className={cn('text-sm', theme === 'dark' && 'font-semibold text-blue-600 dark:text-blue-400')}>
              Dark
            </span>
          </DropdownItem>
          <DropdownItem
            icon={<Monitor className="h-4 w-4" />}
            onClick={() => setTheme('system')}
          >
            <span className={cn('text-sm', theme === 'system' && 'font-semibold text-blue-600 dark:text-blue-400')}>
              System
            </span>
          </DropdownItem>
        </DropdownMenu>

        {/* Language Switcher */}
        <DropdownMenu
          trigger={
            <button className="flex items-center gap-1 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-[var(--plasma-hover)] hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
              <Globe className="h-5 w-5" />
              <span className="text-xs font-medium uppercase">{i18n.language.slice(0, 2)}</span>
            </button>
          }
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <DropdownItem
              key={lang.code}
              onClick={() => i18n.changeLanguage(lang.code)}
            >
              <span className={cn(
                'text-sm',
                i18n.language.startsWith(lang.code) && 'font-semibold text-blue-600 dark:text-blue-400',
              )}>
                {lang.label}
              </span>
            </DropdownItem>
          ))}
        </DropdownMenu>

        {/* Notifications */}
        <Link
          to="/notifications"
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
          className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-[var(--plasma-hover)] hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4.5 min-w-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] rounded-full font-bold px-1 ring-2 ring-white dark:ring-gray-900">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* User dropdown */}
        <DropdownMenu
          trigger={
            <button aria-label="User menu" className="flex items-center gap-2 rounded-xl p-1 hover:bg-[var(--plasma-hover)] transition-colors ml-1">
              <Avatar user={user || undefined} size="sm" />
            </button>
          }
        >
          {user && (
            <div className="px-3 py-2.5 border-b border-[var(--plasma-border)]">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{user.displayName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{user.email}</p>
            </div>
          )}
          <DropdownItem
            icon={<User className="h-4 w-4" />}
            onClick={() => navigate('/settings')}
          >
            {t('nav.profile')}
          </DropdownItem>
          <DropdownItem
            icon={<Settings className="h-4 w-4" />}
            onClick={() => navigate('/settings')}
          >
            {t('nav.settings')}
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem
            icon={<LogOut className="h-4 w-4" />}
            destructive
            onClick={() => logout.mutate()}
          >
            {t('auth.logOut')}
          </DropdownItem>
        </DropdownMenu>
      </div>
    </header>
  )
}
