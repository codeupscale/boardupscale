import { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useMyMemberships, useSwitchOrg } from '@/hooks/useOrganization'
import { useUiStore } from '@/store/ui.store'

const ORG_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-purple-500 to-pink-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-purple-600',
]

function getOrgGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return ORG_GRADIENTS[Math.abs(hash) % ORG_GRADIENTS.length]
}

export function OrgSwitcher() {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const user = useAuthStore((s) => s.user)
  const { isSidebarOpen } = useUiStore()
  const { data: memberships, isLoading } = useMyMemberships()
  const switchOrg = useSwitchOrg()

  const currentOrgId = user?.organizationId
  const currentMembership = memberships?.find((m) => m.organizationId === currentOrgId)
  const currentOrgName = currentMembership?.organization?.name ?? 'Organization'

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close dropdown on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const hasMultipleOrgs = memberships && memberships.length > 1

  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 mx-2 mt-2',
          !isSidebarOpen && 'justify-center px-2 mx-0',
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        {isSidebarOpen && (
          <span className="text-xs text-gray-400">Loading...</span>
        )}
      </div>
    )
  }

  // Single org - just show the name, no dropdown
  if (!hasMultipleOrgs) {
    return (
      <div
        className={cn(
          'flex items-center gap-2.5 px-3 py-2.5 mx-2 mt-2',
          !isSidebarOpen && 'justify-center px-2 mx-0',
        )}
      >
        <span className={cn(
          'h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 bg-gradient-to-br shadow-sm',
          getOrgGradient(currentOrgName),
        )}>
          {currentOrgName.charAt(0).toUpperCase()}
        </span>
        {isSidebarOpen && (
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {currentOrgName}
          </span>
        )}
      </div>
    )
  }

  // Multiple orgs - show dropdown
  return (
    <div ref={dropdownRef} className="relative mx-2 mt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={switchOrg.isPending}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Switch organization"
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all duration-150',
          'hover:bg-[var(--plasma-hover)]',
          'border border-[var(--plasma-border)]',
          isOpen && 'bg-[var(--plasma-hover)]',
          !isSidebarOpen && 'justify-center px-2',
        )}
      >
        <span className={cn(
          'h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 bg-gradient-to-br shadow-sm',
          getOrgGradient(currentOrgName),
        )}>
          {currentOrgName.charAt(0).toUpperCase()}
        </span>
        {isSidebarOpen && (
          <>
            <span className="flex-1 text-left font-semibold text-gray-900 dark:text-gray-100 truncate">
              {currentOrgName}
            </span>
            {switchOrg.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400 flex-shrink-0" />
            ) : (
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-gray-400 flex-shrink-0 transition-transform duration-200',
                  isOpen && 'rotate-180',
                )}
              />
            )}
          </>
        )}
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Organizations"
          className={cn(
            'absolute left-0 right-0 mt-1.5 py-1 bg-white dark:bg-[var(--plasma-surface)] border border-[var(--plasma-border)] rounded-xl shadow-xl z-50',
            'animate-in fade-in slide-in-from-top-1 duration-150',
            !isSidebarOpen && 'left-full ml-2 top-0 w-56',
          )}
        >
          <div className="px-3 py-1.5">
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
              Organizations
            </p>
          </div>
          {memberships?.map((membership) => {
            const isCurrent = membership.organizationId === currentOrgId
            const orgName = membership.organization.name
            return (
              <button
                key={membership.id}
                role="option"
                aria-selected={isCurrent}
                disabled={isCurrent || switchOrg.isPending}
                onClick={() => {
                  if (!isCurrent) {
                    switchOrg.mutate(membership.organizationId)
                    setIsOpen(false)
                  }
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-all duration-150 text-left',
                  isCurrent
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-[var(--plasma-hover)]',
                  switchOrg.isPending && !isCurrent && 'opacity-50 cursor-not-allowed',
                )}
              >
                <span className={cn(
                  'h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 bg-gradient-to-br',
                  getOrgGradient(orgName),
                )}>
                  {orgName.charAt(0).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{orgName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{membership.role}</p>
                </div>
                {isCurrent && (
                  <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
