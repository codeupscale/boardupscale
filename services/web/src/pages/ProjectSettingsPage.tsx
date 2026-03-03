import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Plus, Trash2, Edit2, AlertTriangle, Shield, Globe } from 'lucide-react'
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
import { Tabs, TabContent } from '@/components/ui/tabs'
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
import { cn } from '@/lib/utils'

const STATUS_COLORS = [
  '#6b7280', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316',
]

export function ProjectSettingsPage() {
  const { t } = useTranslation()
  const { id: projectId } = useParams<{ id: string }>()
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

  const { data: project, isLoading } = useProject(projectId!)
  const { data: board } = useBoard(projectId!)
  const { data: members } = useProjectMembers(projectId!)
  const { data: users } = useUsers()

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
          projectId: projectId!,
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
          projectId: projectId!,
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
          { label: project?.name || '...', href: `/projects/${projectId}/board` },
          { label: t('nav.settings') },
        ]}
      />

      <div className="p-6">
        <Tabs
          tabs={[
            { id: 'general', label: t('settings.general') },
            { id: 'members', label: t('projects.members') },
            { id: 'workflow', label: t('settings.workflow') },
            { id: 'roles', label: 'Roles & Permissions' },
            { id: 'webhooks', label: 'Webhooks' },
            { id: 'custom-fields', label: 'Custom Fields' },
            { id: 'components', label: 'Components' },
            { id: 'versions', label: 'Versions' },
            { id: 'danger', label: t('settings.dangerZone') },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        <TabContent>
          {/* General */}
          {activeTab === 'general' && project && (
            <div className="max-w-lg">
              <h2 className="text-base font-semibold text-gray-900 mb-4">{t('settings.generalSettings')}</h2>
              <ProjectForm
                project={project}
                onSubmit={(values) =>
                  updateProject.mutate({ id: project.id, ...values })
                }
                onCancel={() => {}}
                isLoading={updateProject.isPending}
                submitLabel={t('settings.saveChanges')}
              />
            </div>
          )}

          {/* Members */}
          {activeTab === 'members' && (
            <div className="max-w-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900">{t('projects.projectMembers')}</h2>
                <Button size="sm" onClick={() => setShowAddMember(true)}>
                  <Plus className="h-4 w-4" />
                  {t('projects.addMember')}
                </Button>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-4">
                <MemberList projectId={projectId!} members={members || []} />
              </div>
            </div>
          )}

          {/* Workflow */}
          {activeTab === 'workflow' && (
            <div className="max-w-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900">{t('settings.issueStatuses')}</h2>
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
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {board?.statuses?.map((status) => (
                  <div key={status.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: status.color || '#6b7280' }}
                    />
                    <span className="flex-1 text-sm font-medium text-gray-900">{status.name}</span>
                    <span className="text-xs text-gray-400">{status.category}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleOpenEditStatus(status)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-gray-400 hover:text-red-600"
                      onClick={() =>
                        deleteStatus.mutate({ projectId: projectId!, statusId: status.id })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {(!board?.statuses || board.statuses.length === 0) && (
                  <div className="py-8 text-center text-sm text-gray-400">
                    {t('settings.noStatusesConfigured')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Roles & Permissions */}
          {activeTab === 'roles' && (
            <div className="max-w-2xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Roles & Permissions</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Manage organization-wide roles or assign roles to project members.
                  </p>
                </div>
                <Link to="/settings/roles">
                  <Button size="sm" variant="outline">
                    <Shield className="h-4 w-4" />
                    Manage Roles
                  </Button>
                </Link>
              </div>

              {/* Assign roles to members inline */}
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                <MemberRoleList projectId={projectId!} />
              </div>
            </div>
          )}

          {/* Webhooks */}
          {activeTab === 'webhooks' && (
            <div className="max-w-lg">
              <div className="flex items-start gap-3">
                <Globe className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-gray-900 mb-1">Webhooks</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    Configure webhooks to receive real-time HTTP callbacks when events occur in this project.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => navigate(`/projects/${projectId}/webhooks`)}
                  >
                    Manage Webhooks
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Custom Fields */}
          {activeTab === 'custom-fields' && (
            <div className="max-w-2xl">
              <CustomFieldSettings projectId={projectId!} />
            </div>
          )}

          {/* Components */}
          {activeTab === 'components' && (
            <div className="max-w-2xl">
              <ComponentList projectId={projectId!} />
            </div>
          )}

          {/* Versions */}
          {activeTab === 'versions' && (
            <div className="max-w-2xl">
              <VersionList projectId={projectId!} />
            </div>
          )}

          {/* Danger Zone */}
          {activeTab === 'danger' && (
            <div className="max-w-lg">
              <div className="border border-red-200 rounded-xl p-5 bg-red-50">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-red-800 mb-1">
                      {t('settings.deleteProject')}
                    </h3>
                    <p className="text-sm text-red-700 mb-4">
                      {t('settings.deleteProjectDesc')}
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowDeleteProject(true)}
                    >
                      {t('settings.deleteProject')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabContent>
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
                  { projectId: projectId!, userId: newMemberId, role: newMemberRole },
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
          deleteProject.mutate(projectId!, {
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
      <div className="py-8 text-center text-sm text-gray-400">
        No members in this project.
      </div>
    )
  }

  return (
    <>
      {members.map((member) => (
        <div key={member.id} className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-gray-900">
              {member.user?.displayName || member.userId}
            </span>
            <span className="text-xs text-gray-400 ml-2">
              {member.user?.email}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{member.role}</Badge>
            <select
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={(member as any).roleId || ''}
              onChange={(e) => {
                if (e.target.value) {
                  assignRole.mutate({
                    projectId,
                    memberId: member.id,
                    roleId: e.target.value,
                  })
                }
              }}
            >
              <option value="">Assign role...</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.isSystem ? '(system)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </>
  )
}
