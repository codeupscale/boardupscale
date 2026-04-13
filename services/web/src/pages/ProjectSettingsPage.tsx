import { ElementType, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Plus, Trash2, Edit2, AlertTriangle, Shield, Globe,
  Settings, Users, GitBranch, SlidersHorizontal, Layers,
  Tag, Sparkles, Github, Zap,
} from 'lucide-react'
import { AutomationsContent } from '@/pages/ProjectAutomationsPage'
import { TrashContent } from '@/pages/ProjectTrashPage'
import { useTranslation } from 'react-i18next'
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  useProjectMembers,
  useAddProjectMember,
} from '@/hooks/useProjects'
import { useBoard, useCreateStatus, useUpdateStatus, useDeleteStatus } from '@/hooks/useBoard'
import { useUsers } from '@/hooks/useUsers'
import { useMe } from '@/hooks/useAuth'
import { useRoles, useAssignRole } from '@/hooks/usePermissions'
import { IssueStatusCategory } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { LoadingPage } from '@/components/ui/spinner'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { MemberList } from '@/components/projects/member-list'
import { UserSelect } from '@/components/common/user-select'
import { ProjectForm } from '@/components/projects/project-form'
import { CustomFieldSettings } from '@/components/projects/custom-field-settings'
import { ComponentList } from '@/components/projects/component-list'
import { VersionList } from '@/components/projects/version-list'
import { GitHubConnection } from '@/components/projects/github-connection'
import { AiUsageDashboard } from '@/components/ai/AiUsageDashboard'
import { cn } from '@/lib/utils'

const STATUS_COLORS = [
  '#6b7280', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316',
]

interface SettingItem {
  id: string
  label: string
  icon: ElementType
}

const SETTINGS_GROUPS: Array<{ label: string; items: SettingItem[] }> = [
  {
    label: 'Project',
    items: [
      { id: 'general', label: 'General', icon: Settings },
      { id: 'workflow', label: 'Workflow', icon: GitBranch },
      { id: 'custom-fields', label: 'Custom Fields', icon: SlidersHorizontal },
      { id: 'components', label: 'Components', icon: Layers },
      { id: 'versions', label: 'Versions', icon: Tag },
      { id: 'automations', label: 'Automations', icon: Zap },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { id: 'github', label: 'GitHub', icon: Github },
      { id: 'webhooks', label: 'Webhooks', icon: Globe },
      { id: 'ai', label: 'AI Usage', icon: Sparkles },
    ],
  },
  {
    label: 'Team',
    items: [
      { id: 'members', label: 'Members', icon: Users },
      { id: 'roles', label: 'Roles & Permissions', icon: Shield },
    ],
  },
]

export function ProjectSettingsPage() {
  const { t } = useTranslation()
  const { key: projectKey } = useParams<{ key: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('general')
  const [showAddMember, setShowAddMember] = useState(false)
  const [newMemberId, setNewMemberId] = useState<string | null>(null)
  const [newMemberRole, setNewMemberRole] = useState('member')
  const [showAddStatus, setShowAddStatus] = useState(false)
  const [editStatus, setEditStatus] = useState<any | null>(null)
  const [statusName, setStatusName] = useState('')
  const [statusCategory, setStatusCategory] = useState(IssueStatusCategory.TODO)
  const [statusColor, setStatusColor] = useState(STATUS_COLORS[0])
  const [showDeleteProject, setShowDeleteProject] = useState(false)

  const { data: project, isLoading } = useProject(projectKey!)
  const { data: board } = useBoard(projectKey!)
  const { data: members } = useProjectMembers(projectKey!)
  const { data: usersResult } = useUsers()
  const users = usersResult?.data

  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()
  const addMember = useAddProjectMember()
  const createStatus = useCreateStatus()
  const updateStatus = useUpdateStatus()
  const deleteStatus = useDeleteStatus()

  if (isLoading) return <LoadingPage />

  const handleOpenEditStatus = (status: any) => {
    setEditStatus(status)
    setStatusName(status.name)
    setStatusCategory(status.category)
    setStatusColor(status.color || STATUS_COLORS[0])
    setShowAddStatus(true)
  }

  const handleStatusSubmit = () => {
    if (editStatus) {
      updateStatus.mutate(
        {
          projectId: projectKey!,
          statusId: editStatus.id,
          name: statusName,
          category: statusCategory,
          color: statusColor,
        },
        {
          onSuccess: () => {
            setShowAddStatus(false)
            setEditStatus(null)
          },
        },
      )
    } else {
      createStatus.mutate(
        {
          projectId: projectKey!,
          name: statusName,
          category: statusCategory,
          color: statusColor,
        },
        {
          onSuccess: () => {
            setShowAddStatus(false)
            setStatusName('')
          },
        },
      )
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('nav.projectSettings')}
        breadcrumbs={[
          { label: t('nav.projects'), href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectKey}/board` },
          { label: t('nav.settings') },
        ]}
      />

      <ProjectTabNav projectKey={projectKey!} />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900 overflow-y-auto">
          {SETTINGS_GROUPS.map((group) => (
            <div key={group.label} className="px-2 pt-4 pb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 pb-1">
                {group.label}
              </p>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  aria-current={activeTab === item.id ? 'true' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left w-full mb-0.5',
                    activeTab === item.id
                      ? 'bg-blue-50 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300 font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/70',
                  )}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </button>
              ))}
            </div>
          ))}

          {/* Administration — bottom, separated */}
          <div className="px-2 pt-2 pb-4 mt-auto border-t border-gray-100 dark:border-gray-800">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 pb-1 pt-3">
              Administration
            </p>
            <button
              onClick={() => setActiveTab('trash')}
              aria-current={activeTab === 'trash' ? 'true' : undefined}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left w-full mb-0.5',
                activeTab === 'trash'
                  ? 'bg-blue-50 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300 font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/70',
              )}
            >
              <Trash2 className="h-4 w-4 flex-shrink-0" />
              Trash
            </button>
            <button
              onClick={() => setActiveTab('danger')}
              aria-current={activeTab === 'danger' ? 'true' : undefined}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left w-full',
                activeTab === 'danger'
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-medium'
                  : 'text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20',
              )}
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Danger Zone
            </button>
          </div>
        </div>

        {/* Content panel */}
        <div className="flex-1 overflow-auto p-6 bg-white dark:bg-gray-900">

          {/* General */}
          {activeTab === 'general' && project && (
            <div className="max-w-lg">
              <div className="mb-6">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('settings.generalSettings')}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage your project name, key, type, and description.</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <ProjectForm
                  project={project}
                  onSubmit={(values) => updateProject.mutate({ id: project.id, ...values })}
                  onCancel={() => {}}
                  isLoading={updateProject.isPending}
                  submitLabel={t('settings.saveChanges')}
                />
              </div>
            </div>
          )}

          {/* Members */}
          {activeTab === 'members' && (
            <div className="max-w-2xl">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('projects.projectMembers')}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Add and manage who has access to this project.</p>
                </div>
                <Button size="sm" onClick={() => setShowAddMember(true)}>
                  <Plus className="h-4 w-4" />
                  {t('projects.addMember')}
                </Button>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700/60">
                <MemberList projectId={projectKey!} members={members || []} />
              </div>
            </div>
          )}

          {/* Workflow */}
          {activeTab === 'workflow' && (
            <div className="max-w-2xl">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('settings.issueStatuses')}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Define the statuses issues move through in this project.</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditStatus(null)
                    setStatusName('')
                    setStatusCategory(IssueStatusCategory.TODO)
                    setStatusColor(STATUS_COLORS[0])
                    setShowAddStatus(true)
                  }}
                >
                  <Plus className="h-4 w-4" />
                  {t('settings.addStatus')}
                </Button>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700/60">
                {board?.statuses?.map((status) => (
                  <div key={status.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: status.color || '#6b7280' }} />
                    <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">{status.name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{status.category}</span>
                    <Button variant="ghost" size="icon-sm" onClick={() => handleOpenEditStatus(status)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                      onClick={() => deleteStatus.mutate({ projectId: projectKey!, statusId: status.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {(!board?.statuses || board.statuses.length === 0) && (
                  <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                    {t('settings.noStatusesConfigured')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Roles */}
          {activeTab === 'roles' && (
            <div className="max-w-2xl">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Roles & Permissions</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Assign roles to project members and manage access levels.</p>
                </div>
                <Link to="/settings/roles">
                  <Button size="sm" variant="outline">
                    <Shield className="h-4 w-4" />
                    Manage Roles
                  </Button>
                </Link>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700/60">
                <MemberRoleList projectId={projectKey!} />
              </div>
            </div>
          )}

          {/* Webhooks */}
          {activeTab === 'webhooks' && (
            <div className="max-w-lg">
              <div className="mb-6">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Webhooks</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Receive HTTP callbacks when events occur in this project.</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <Globe className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Project Webhooks</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Configure outgoing HTTP callbacks</p>
                  </div>
                </div>
                <Button size="sm" onClick={() => navigate(`/projects/${projectKey}/webhooks`)}>
                  Manage
                </Button>
              </div>
            </div>
          )}

          {/* Custom Fields */}
          {activeTab === 'custom-fields' && (
            <div className="max-w-2xl">
              <div className="mb-6">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Custom Fields</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Add extra fields to issues in this project.</p>
              </div>
              <CustomFieldSettings projectId={projectKey!} />
            </div>
          )}

          {/* Components */}
          {activeTab === 'components' && (
            <div className="max-w-2xl">
              <div className="mb-6">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Components</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Organize issues by functional areas of your project.</p>
              </div>
              <ComponentList projectId={projectKey!} />
            </div>
          )}

          {/* Versions */}
          {activeTab === 'versions' && (
            <div className="max-w-2xl">
              <div className="mb-6">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Versions</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Track releases and milestones for this project.</p>
              </div>
              <VersionList projectId={projectKey!} />
            </div>
          )}

          {/* GitHub */}
          {activeTab === 'github' && (
            <div className="max-w-lg">
              <div className="mb-6">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">GitHub Integration</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Connect a GitHub repository to auto-link commits and pull requests.</p>
              </div>
              <GitHubConnection projectId={projectKey!} />
            </div>
          )}

          {/* AI Usage */}
          {activeTab === 'ai' && (
            <div className="max-w-3xl">
              <div className="mb-6">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">AI Usage</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Monitor AI feature usage and credits for this project.</p>
              </div>
              <AiUsageDashboard />
            </div>
          )}

          {/* Automations */}
          {activeTab === 'automations' && projectKey && (
            <div className="max-w-3xl">
              <div className="mb-6">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Automations</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Create rules to automate repetitive tasks in this project.</p>
              </div>
              <AutomationsContent projectKey={projectKey} />
            </div>
          )}

          {/* Trash */}
          {activeTab === 'trash' && projectKey && (
            <div>
              <div className="mb-6">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Trash</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Deleted issues are kept here for 30 days before permanent removal.</p>
              </div>
              <TrashContent projectKey={projectKey} />
            </div>
          )}

          {/* Danger Zone */}
          {activeTab === 'danger' && (
            <div className="max-w-lg">
              <div className="mb-6">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Danger Zone</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Irreversible actions that affect this project permanently.</p>
              </div>
              <div className="rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/10 p-5">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">
                      {t('settings.deleteProject')}
                    </h3>
                    <p className="text-sm text-red-600 dark:text-red-400 mb-4">
                      {t('settings.deleteProjectDesc')}
                    </p>
                    <Button variant="destructive" size="sm" onClick={() => setShowDeleteProject(true)}>
                      {t('settings.deleteProject')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Add Member Dialog */}
      <Dialog open={showAddMember} onClose={() => setShowAddMember(false)} className="max-w-sm">
        <DialogHeader onClose={() => setShowAddMember(false)}>
          <DialogTitle>{t('projects.addMember')}</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.user')}</label>
            <UserSelect value={newMemberId} onChange={setNewMemberId} />
            <p className="mt-1.5 text-xs text-gray-500">
              Only users in your organization are shown.{' '}
              <Link to="/settings/team" className="text-blue-600 hover:text-blue-700 font-medium underline">
                Invite new users from Settings &rarr; Team
              </Link>{' '}
              first, then add them to this project.
            </p>
          </div>
          <Select
            label={t('settings.role')}
            options={[
              { value: 'viewer', label: t('settings.viewer') },
              { value: 'member', label: t('projects.member') },
              { value: 'manager', label: t('settings.manager') },
              { value: 'admin', label: t('settings.admin') },
            ]}
            value={newMemberRole}
            onChange={(e) => setNewMemberRole(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowAddMember(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!newMemberId}
              isLoading={addMember.isPending}
              onClick={() => {
                if (!newMemberId) return
                addMember.mutate(
                  { projectId: projectKey!, userId: newMemberId, role: newMemberRole },
                  { onSuccess: () => { setShowAddMember(false); setNewMemberId(null) } },
                )
              }}
            >
              {t('projects.addMember')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Status Dialog */}
      <Dialog open={showAddStatus} onClose={() => setShowAddStatus(false)} className="max-w-sm">
        <DialogHeader onClose={() => setShowAddStatus(false)}>
          <DialogTitle>{editStatus ? t('settings.editStatus') : t('settings.addStatus')}</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <Input
            label={t('settings.statusName')}
            placeholder="e.g. In Review"
            value={statusName}
            onChange={(e) => setStatusName(e.target.value)}
          />
          <Select
            label={t('settings.category')}
            options={[
              { value: IssueStatusCategory.TODO, label: t('settings.toDo') },
              { value: IssueStatusCategory.IN_PROGRESS, label: t('settings.inProgress') },
              { value: IssueStatusCategory.DONE, label: t('settings.done') },
            ]}
            value={statusCategory}
            onChange={(e) => setStatusCategory(e.target.value as IssueStatusCategory)}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.color')}</label>
            <div className="flex gap-2 flex-wrap">
              {STATUS_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  style={{ backgroundColor: c }}
                  className={cn(
                    'h-7 w-7 rounded-full transition-transform',
                    statusColor === c && 'ring-2 ring-offset-2 ring-gray-400 scale-110',
                  )}
                  onClick={() => setStatusColor(c)}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAddStatus(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              isLoading={createStatus.isPending || updateStatus.isPending}
              onClick={handleStatusSubmit}
              disabled={!statusName}
            >
              {editStatus ? t('common.save') : t('common.add')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Project Confirm */}
      <ConfirmDialog
        open={showDeleteProject}
        onClose={() => setShowDeleteProject(false)}
        onConfirm={() =>
          deleteProject.mutate(projectKey!, {
            onSuccess: () => navigate('/projects'),
          })
        }
        title={t('settings.deleteProject')}
        description={t('settings.deleteProjectConfirm', { name: project?.name })}
        confirmLabel={t('settings.deleteProject')}
        destructive
        isLoading={deleteProject.isPending}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  MemberRoleList: inline role assignment for project members                */
/* -------------------------------------------------------------------------- */

function MemberRoleList({ projectId }: { projectId: string }) {
  const { data: me } = useMe()
  const { data: members = [] } = useProjectMembers(projectId)
  const { data: roles = [] } = useRoles(me?.organizationId)
  const assignRole = useAssignRole()

  if (members.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        No members in this project.
      </div>
    )
  }

  return (
    <>
      {members.map((member) => (
        <div key={member.id} className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {member.user?.displayName || member.userId}
            </span>
            <span className="text-xs text-gray-500 ml-2">
              {member.user?.email}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{member.role}</Badge>
            <div className="w-40">
              <Select
                value={member.roleId ?? ''}
                onChange={(e) => {
                  if (e.target.value) {
                    assignRole.mutate({
                      projectId,
                      memberId: member.id,
                      roleId: e.target.value,
                    })
                  }
                }}
                placeholder="Assign role..."
                options={roles.map((r) => ({
                  value: r.id,
                  label: `${r.name}${r.isSystem ? ' (system)' : ''}`,
                }))}
                className="text-xs"
                disabled={assignRole.isPending}
              />
            </div>
          </div>
        </div>
      ))}
    </>
  )
}
