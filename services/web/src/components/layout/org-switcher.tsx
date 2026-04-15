import { useState } from 'react'
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useMyMemberships, useSwitchOrg } from '@/hooks/useOrganization'
import { useUiStore } from '@/store/ui.store'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

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
  const [open, setOpen] = useState(false)
  const user = useAuthStore((s) => s.user)
  const { isSidebarOpen } = useUiStore()
  const { data: memberships, isLoading } = useMyMemberships()
  const switchOrg = useSwitchOrg()

  const currentOrgId = user?.organizationId
  // Fall back to the default membership (or first) when user hasn't loaded yet
  const currentMembership = memberships?.find((m) => m.organizationId === currentOrgId)
    ?? memberships?.find((m) => m.isDefault)
    ?? memberships?.[0]
  const currentOrgName = currentMembership?.organization?.name || 'My Workspace'

  // Count distinct orgs — duplicate membership rows must not falsely trigger the dropdown
  const uniqueOrgCount = new Set(memberships?.map((m) => m.organizationId)).size
  const hasMultipleOrgs = uniqueOrgCount > 1

  if (isLoading) {
    return (
      <div className="space-y-2 px-2">
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
      </div>
    )
  }

  // Single org — static display, no dropdown
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
          <span className="flex-1 text-left font-semibold text-foreground truncate">
            {currentOrgName}
          </span>
        )}
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          role="combobox"
          aria-expanded={open}
          aria-label="Switch organization"
          disabled={switchOrg.isPending}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2.5 mx-2 mt-2 rounded-xl text-sm transition-all duration-150',
            'hover:bg-accent/70 active:scale-[0.98]',
            'border border-transparent hover:border-border/60',
            open && 'bg-accent/70 border-border/60',
            !isSidebarOpen && 'justify-center px-2 mx-0',
            isSidebarOpen && 'max-w-[calc(100%-1rem)]',
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
              <span className="flex-1 text-left font-semibold text-foreground truncate">
                {currentOrgName}
              </span>
              {switchOrg.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              )}
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-0"
        align="start"
        side={isSidebarOpen ? 'bottom' : 'right'}
        sideOffset={8}
      >
        <Command>
          {memberships && memberships.length > 3 && (
            <CommandInput placeholder="Search organizations..." />
          )}
          <CommandList>
            <CommandEmpty>No organization found.</CommandEmpty>
            <CommandGroup heading="Organizations">
              {memberships?.map((membership) => {
                const isCurrent = membership.organizationId === currentOrgId
                const orgName = membership.organization.name
                return (
                  <CommandItem
                    key={membership.id}
                    value={orgName}
                    onSelect={() => {
                      if (!isCurrent) {
                        switchOrg.mutate(membership.organizationId)
                      }
                      setOpen(false)
                    }}
                    className="gap-2.5 px-2 py-2"
                  >
                    <span className={cn(
                      'h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 bg-gradient-to-br',
                      getOrgGradient(orgName),
                    )}>
                      {orgName.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{orgName}</p>
                      <p className="text-xs text-muted-foreground capitalize">{membership.role}</p>
                    </div>
                    {isCurrent && (
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false)
                  window.location.href = '/settings/team'
                }}
                className="gap-2.5 px-2 py-2"
              >
                <div className="h-6 w-6 rounded-md flex items-center justify-center bg-muted flex-shrink-0">
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground">Create organization</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
