import { useState, useMemo } from 'react'
import { Shield, Plus, Edit2, Trash2, Lock } from 'lucide-react'
import { useMe } from '@/hooks/useAuth'
import {
  usePermissions,
  useRoles,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
} from '@/hooks/usePermissions'
import { Permission, Role } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SettingsSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { cn } from '@/lib/utils'

/** Group permissions by resource for display in a grid. */
function groupPermissionsByResource(permissions: Permission[]) {
  const groups: Record<string, Permission[]> = {}
  for (const p of permissions) {
    if (!groups[p.resource]) groups[p.resource] = []
    groups[p.resource].push(p)
  }
  // Sort actions within each resource for consistent display
  for (const resource of Object.keys(groups)) {
    groups[resource].sort((a, b) => a.action.localeCompare(b.action))
  }
  return groups
}

/** Capitalize first letter */
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const RESOURCE_ORDER = [
  'project',
  'issue',
  'board',
  'sprint',
  'comment',
  'worklog',
  'member',
  'organization',
]

export function RoleManagementPage() {
  const { data: me } = useMe()
  const { data: permissions = [], isLoading: permLoading } = usePermissions()
  const { data: roles = [], isLoading: rolesLoading } = useRoles(me?.organizationId)
  const createRole = useCreateRole()
  const updateRole = useUpdateRole()
  const deleteRole = useDeleteRole()

  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [roleName, setRoleName] = useState('')
  const [roleDescription, setRoleDescription] = useState('')
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)
  const [expandedRole, setExpandedRole] = useState<string | null>(null)

  const isLoading = permLoading || rolesLoading

  const permissionGroups = useMemo(() => {
    const grouped = groupPermissionsByResource(permissions)
    // Return in our preferred order
    const ordered: [string, Permission[]][] = []
    for (const res of RESOURCE_ORDER) {
      if (grouped[res]) ordered.push([res, grouped[res]])
    }
    // Append any others not in our explicit order
    for (const res of Object.keys(grouped)) {
      if (!RESOURCE_ORDER.includes(res)) ordered.push([res, grouped[res]])
    }
    return ordered
  }, [permissions])

  // All unique actions across all resources, for the column headers
  const allActions = useMemo(() => {
    const set = new Set<string>()
    for (const p of permissions) set.add(p.action)
    return ['create', 'read', 'update', 'delete', 'assign', 'manage'].filter((a) =>
      set.has(a),
    )
  }, [permissions])

  const openCreateDialog = () => {
    setEditingRole(null)
    setRoleName('')
    setRoleDescription('')
    setSelectedPermissionIds(new Set())
    setShowRoleDialog(true)
  }

  const openEditDialog = (role: Role) => {
    setEditingRole(role)
    setRoleName(role.name)
    setRoleDescription(role.description || '')
    setSelectedPermissionIds(new Set(role.permissions.map((p) => p.id)))
    setShowRoleDialog(true)
  }

  const togglePermission = (permId: string) => {
    setSelectedPermissionIds((prev) => {
      const next = new Set(prev)
      if (next.has(permId)) {
        next.delete(permId)
      } else {
        next.add(permId)
      }
      return next
    })
  }

  const toggleResourceAll = (resourcePerms: Permission[]) => {
    setSelectedPermissionIds((prev) => {
      const next = new Set(prev)
      const allSelected = resourcePerms.every((p) => next.has(p.id))
      for (const p of resourcePerms) {
        if (allSelected) {
          next.delete(p.id)
        } else {
          next.add(p.id)
        }
      }
      return next
    })
  }

  const handleSave = () => {
    const permissionIds = Array.from(selectedPermissionIds)
    if (editingRole) {
      updateRole.mutate(
        {
          roleId: editingRole.id,
          name: roleName,
          description: roleDescription || undefined,
          permissionIds,
        },
        { onSuccess: () => setShowRoleDialog(false) },
      )
    } else {
      if (!me?.organizationId) return
      createRole.mutate(
        {
          organizationId: me.organizationId,
          name: roleName,
          description: roleDescription || undefined,
          permissionIds,
        },
        { onSuccess: () => setShowRoleDialog(false) },
      )
    }
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteRole.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    })
  }

  /** Build a lookup: permissionId from (resource, action) */
  const permLookup = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of permissions) {
      map.set(`${p.resource}:${p.action}`, p.id)
    }
    return map
  }, [permissions])

  if (isLoading) return <SettingsSkeleton showNav={false} fields={6} />

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Roles & Permissions"
        breadcrumbs={[
          { label: 'Settings', href: '/settings' },
          { label: 'Roles & Permissions' },
        ]}
        actions={
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            Create Role
          </Button>
        }
      />

      <div className="flex-1 overflow-auto min-h-0 p-6 bg-background">
        {roles.length === 0 ? (
          <EmptyState
            icon={<Shield className="h-12 w-12" />}
            title="No roles configured"
            description="Create custom roles to define fine-grained permissions for your team."
            action={{ label: 'Create Role', onClick: openCreateDialog }}
          />
        ) : (
          <div className="space-y-3">
            {roles.map((role) => {
              const isExpanded = expandedRole === role.id
              const isSystem = role.isSystem

              return (
                <div
                  key={role.id}
                  className={cn(
                    'bg-card rounded-2xl border border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow',
                    isSystem
                      ? 'border-l-4 border-l-purple-400 dark:border-l-purple-500'
                      : 'border-l-4 border-l-primary',
                  )}
                >
                  {/* Role header row */}
                  <div className="flex items-center gap-3 px-5 py-4">
                    <button
                      className="flex-1 flex items-center gap-3 text-left"
                      onClick={() => setExpandedRole(isExpanded ? null : role.id)}
                      aria-expanded={isExpanded}
                    >
                      <div
                        className={cn(
                          'h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0',
                          isSystem
                            ? 'bg-purple-50 dark:bg-purple-900/20'
                            : 'bg-primary/10',
                        )}
                      >
                        <Shield
                          className={cn(
                            'h-4.5 w-4.5',
                            isSystem
                              ? 'text-purple-500 dark:text-purple-400'
                              : 'text-primary dark:text-primary',
                          )}
                          style={{ width: '1.125rem', height: '1.125rem' }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">
                            {role.name}
                          </span>
                          {role.isSystem && (
                            <Badge variant="outline" className="border-purple-200 dark:border-purple-700 text-purple-600 dark:text-purple-400">
                              <Lock className="h-3 w-3 mr-1" />
                              System
                            </Badge>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {role.description}
                          </p>
                        )}
                      </div>
                      <span className="bg-muted text-foreground px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0">
                        {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
                      </span>
                    </button>
                    {!role.isSystem && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditDialog(role)}
                          aria-label={`Edit ${role.name} role`}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                          onClick={() => setDeleteTarget(role)}
                          aria-label={`Delete ${role.name} role`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Expanded permissions grid */}
                  {isExpanded && (
                    <div className="border-t border-border px-5 py-4 bg-muted/50">
                      <PermissionsGrid
                        permissionGroups={permissionGroups}
                        allActions={allActions}
                        permLookup={permLookup}
                        selectedIds={new Set(role.permissions.map((p) => p.id))}
                        readOnly
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Role Dialog */}
      <Dialog
        open={showRoleDialog}
        onOpenChange={(o) => !o && setShowRoleDialog(false)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingRole ? 'Edit Role' : 'Create Role'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Role Name"
                placeholder="e.g. QA Engineer"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
              />
              <Input
                label="Description"
                placeholder="Optional description"
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value)}
              />
            </div>

            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">
                Permissions
              </h3>
              <PermissionsGrid
                permissionGroups={permissionGroups}
                allActions={allActions}
                permLookup={permLookup}
                selectedIds={selectedPermissionIds}
                onToggle={togglePermission}
                onToggleResource={toggleResourceAll}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoleDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!roleName.trim()}
              isLoading={createRole.isPending || updateRole.isPending}
            >
              {editingRole ? 'Save Changes' : 'Create Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Role"
        description={`Are you sure you want to delete the "${deleteTarget?.name}" role? Members with this role will have it unassigned.`}
        confirmLabel="Delete Role"
        destructive
        isLoading={deleteRole.isPending}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  PermissionsGrid sub-component                                             */
/* -------------------------------------------------------------------------- */

interface PermissionsGridProps {
  permissionGroups: [string, Permission[]][]
  allActions: string[]
  permLookup: Map<string, string>
  selectedIds: Set<string>
  readOnly?: boolean
  onToggle?: (permId: string) => void
  onToggleResource?: (perms: Permission[]) => void
}

function PermissionsGrid({
  permissionGroups,
  allActions,
  permLookup,
  selectedIds,
  readOnly = false,
  onToggle,
  onToggleResource,
}: PermissionsGridProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">
              Resource
            </th>
            {allActions.map((action) => (
              <th
                key={action}
                className="text-center py-2 px-2 font-medium text-muted-foreground text-xs uppercase tracking-wider"
              >
                {capitalize(action)}
              </th>
            ))}
            {!readOnly && (
              <th className="text-center py-2 px-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                All
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {permissionGroups.map(([resource, perms]) => {
            const allSelected = perms.every((p) => selectedIds.has(p.id))
            return (
              <tr key={resource} className="border-b border-border last:border-0">
                <td className="py-2.5 pr-4 font-medium text-foreground">
                  {capitalize(resource)}
                </td>
                {allActions.map((action) => {
                  const permId = permLookup.get(`${resource}:${action}`)
                  if (!permId) {
                    return (
                      <td key={action} className="text-center py-2.5 px-2">
                        <span className="text-muted-foreground/60">--</span>
                      </td>
                    )
                  }
                  const checked = selectedIds.has(permId)
                  return (
                    <td key={action} className="text-center py-2.5 px-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={readOnly}
                        onChange={() => onToggle?.(permId)}
                        className={cn(
                          'h-4 w-4 rounded border-border text-primary focus:ring-ring',
                          readOnly && 'cursor-default opacity-70',
                        )}
                      />
                    </td>
                  )
                })}
                {!readOnly && (
                  <td className="text-center py-2.5 px-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => onToggleResource?.(perms)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                    />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
