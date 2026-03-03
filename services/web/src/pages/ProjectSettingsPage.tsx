import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Trash2, Edit2, AlertTriangle } from 'lucide-react'
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  useProjectMembers,
  useAddProjectMember,
} from '@/hooks/useProjects'
import { useBoard, useCreateStatus, useUpdateStatus, useDeleteStatus } from '@/hooks/useBoard'
import { useUsers } from '@/hooks/useUsers'
import { IssueStatusCategory } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import { Tabs, TabContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { LoadingPage } from '@/components/ui/spinner'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { MemberList } from '@/components/projects/member-list'
import { UserSelect } from '@/components/common/user-select'
import { ProjectForm } from '@/components/projects/project-form'
import { cn } from '@/lib/utils'

const STATUS_COLORS = [
  '#6b7280', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316',
]

export function ProjectSettingsPage() {
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
        title="Project Settings"
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectId}/board` },
          { label: 'Settings' },
        ]}
      />

      <div className="p-6">
        <Tabs
          tabs={[
            { id: 'general', label: 'General' },
            { id: 'members', label: 'Members' },
            { id: 'workflow', label: 'Workflow' },
            { id: 'danger', label: 'Danger Zone' },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        <TabContent>
          {/* General */}
          {activeTab === 'general' && project && (
            <div className="max-w-lg">
              <h2 className="text-base font-semibold text-gray-900 mb-4">General Settings</h2>
              <ProjectForm
                project={project}
                onSubmit={(values) =>
                  updateProject.mutate({ id: project.id, ...values })
                }
                onCancel={() => {}}
                isLoading={updateProject.isPending}
                submitLabel="Save Changes"
              />
            </div>
          )}

          {/* Members */}
          {activeTab === 'members' && (
            <div className="max-w-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900">Project Members</h2>
                <Button size="sm" onClick={() => setShowAddMember(true)}>
                  <Plus className="h-4 w-4" />
                  Add Member
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
                <h2 className="text-base font-semibold text-gray-900">Issue Statuses</h2>
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
                  Add Status
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
                    No statuses configured.
                  </div>
                )}
              </div>
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
                      Delete Project
                    </h3>
                    <p className="text-sm text-red-700 mb-4">
                      Permanently delete this project and all its issues, sprints, and data. This action
                      cannot be undone.
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowDeleteProject(true)}
                    >
                      Delete Project
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
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
            <UserSelect value={newMemberId} onChange={setNewMemberId} />
          </div>
          <Select
            label="Role"
            options={[
              { value: 'viewer', label: 'Viewer' },
              { value: 'member', label: 'Member' },
              { value: 'manager', label: 'Manager' },
              { value: 'admin', label: 'Admin' },
            ]}
            value={newMemberRole}
            onChange={(e) => setNewMemberRole(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowAddMember(false)}>
              Cancel
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
              Add Member
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Status Dialog */}
      <Dialog open={showAddStatus} onClose={() => setShowAddStatus(false)} className="max-w-sm">
        <DialogHeader onClose={() => setShowAddStatus(false)}>
          <DialogTitle>{editStatus ? 'Edit Status' : 'Add Status'}</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <Input
            label="Status Name"
            placeholder="e.g. In Review"
            value={statusName}
            onChange={(e) => setStatusName(e.target.value)}
          />
          <Select
            label="Category"
            options={[
              { value: IssueStatusCategory.TODO, label: 'To Do' },
              { value: IssueStatusCategory.IN_PROGRESS, label: 'In Progress' },
              { value: IssueStatusCategory.DONE, label: 'Done' },
            ]}
            value={statusCategory}
            onChange={(e) => setStatusCategory(e.target.value as IssueStatusCategory)}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
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
              Cancel
            </Button>
            <Button
              isLoading={createStatus.isPending || updateStatus.isPending}
              onClick={handleStatusSubmit}
              disabled={!statusName}
            >
              {editStatus ? 'Save' : 'Add'}
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
        title="Delete Project"
        description={`Are you sure you want to delete "${project?.name}"? This action cannot be undone.`}
        confirmLabel="Delete Project"
        destructive
        isLoading={deleteProject.isPending}
      />
    </div>
  )
}
