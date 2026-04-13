import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Plus,
  Zap,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Edit2,
  Play,
  History,
} from 'lucide-react'
import {
  useAutomationRules,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  useToggleRule,
  useTestRule,
} from '@/hooks/useAutomation'
import type { AutomationRule, AutomationCondition, AutomationAction } from '@/hooks/useAutomation'
import { useProject } from '@/hooks/useProjects'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { LoadingPage } from '@/components/ui/spinner'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { TriggerSelect, TRIGGER_OPTIONS } from '@/components/automation/trigger-select'
import { ConditionBuilder } from '@/components/automation/condition-builder'
import { ActionBuilder } from '@/components/automation/action-builder'
import { ExecutionLog } from '@/components/automation/execution-log'
import { cn } from '@/lib/utils'

function getTriggerLabel(triggerType: string): string {
  const option = TRIGGER_OPTIONS.find((o) => o.value === triggerType)
  return option?.label || triggerType
}

export function AutomationsContent({ projectKey }: { projectKey: string }) {
  const { data: rules, isLoading } = useAutomationRules(projectKey)

  const createRule = useCreateRule()
  const updateRule = useUpdateRule()
  const deleteRule = useDeleteRule()
  const toggleRule = useToggleRule()
  const testRule = useTestRule()

  const [showEditor, setShowEditor] = useState(false)
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [showLogs, setShowLogs] = useState<string | null>(null)
  const [showTestDialog, setShowTestDialog] = useState<string | null>(null)
  const [testIssueId, setTestIssueId] = useState('')

  // Editor state
  const [ruleName, setRuleName] = useState('')
  const [ruleDescription, setRuleDescription] = useState('')
  const [triggerType, setTriggerType] = useState('issue.created')
  const [conditions, setConditions] = useState<AutomationCondition[]>([])
  const [actions, setActions] = useState<AutomationAction[]>([])

  const openCreateEditor = () => {
    setEditingRule(null)
    setRuleName('')
    setRuleDescription('')
    setTriggerType('issue.created')
    setConditions([])
    setActions([])
    setShowEditor(true)
  }

  const openEditEditor = (rule: AutomationRule) => {
    setEditingRule(rule)
    setRuleName(rule.name)
    setRuleDescription(rule.description || '')
    setTriggerType(rule.triggerType)
    setConditions(rule.conditions || [])
    setActions(rule.actions || [])
    setShowEditor(true)
  }

  const handleSave = () => {
    const payload = {
      name: ruleName,
      description: ruleDescription || undefined,
      triggerType,
      conditions,
      actions,
    }

    if (editingRule) {
      updateRule.mutate(
        { id: editingRule.id, ...payload },
        { onSuccess: () => setShowEditor(false) },
      )
    } else {
      createRule.mutate(
        { projectId: projectKey, ...payload },
        { onSuccess: () => setShowEditor(false) },
      )
    }
  }

  const handleTest = () => {
    if (!showTestDialog || !testIssueId) return
    testRule.mutate({ ruleId: showTestDialog, issueId: testIssueId })
  }

  if (isLoading) return <LoadingPage />

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreateEditor}>
          <Plus className="h-4 w-4" />
          Create Rule
        </Button>
      </div>

      {/* Empty state */}
      {(!rules || rules.length === 0) && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
            <Zap className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            No automation rules yet
          </h2>
          <p className="text-sm text-gray-500 mb-4 text-center max-w-md">
            Create automation rules to automatically perform actions when issues are created,
            updated, or when other events occur.
          </p>
          <Button onClick={openCreateEditor}>
            <Plus className="h-4 w-4" />
            Create Your First Rule
          </Button>
        </div>
      )}

      {/* Rules list */}
      {rules && rules.length > 0 && (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={cn(
                'bg-white rounded-xl border border-gray-200 p-4 transition-colors',
                !rule.isActive && 'opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap
                      className={cn(
                        'h-4 w-4 flex-shrink-0',
                        rule.isActive ? 'text-blue-600' : 'text-gray-400',
                      )}
                    />
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {rule.name}
                    </h3>
                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        rule.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500',
                      )}
                    >
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {rule.description && (
                    <p className="text-sm text-gray-500 mb-2">{rule.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Trigger: {getTriggerLabel(rule.triggerType)}</span>
                    <span>{rule.conditions?.length || 0} condition(s)</span>
                    <span>{rule.actions?.length || 0} action(s)</span>
                    <span>Executed {rule.executionCount} time(s)</span>
                    {rule.lastExecutedAt && (
                      <span>
                        Last: {new Date(rule.lastExecutedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={rule.isActive ? 'Disable' : 'Enable'}
                    onClick={() => toggleRule.mutate({ id: rule.id })}
                  >
                    {rule.isActive ? (
                      <ToggleRight className="h-4 w-4 text-green-600" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-gray-400" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Test rule"
                    onClick={() => {
                      setShowTestDialog(rule.id)
                      setTestIssueId('')
                    }}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Execution logs"
                    onClick={() =>
                      setShowLogs(showLogs === rule.id ? null : rule.id)
                    }
                  >
                    <History className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Edit rule"
                    onClick={() => openEditEditor(rule)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-gray-400 hover:text-red-600"
                    title="Delete rule"
                    onClick={() => setShowDeleteConfirm(rule.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Inline execution logs */}
              {showLogs === rule.id && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Execution History
                  </h4>
                  <ExecutionLog ruleId={rule.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Rule Dialog */}
      <Dialog
        open={showEditor}
        onOpenChange={(o) => !o && setShowEditor(false)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Rule' : 'Create Automation Rule'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 max-h-[60vh] overflow-y-auto">
            <Input
              label="Rule Name"
              placeholder="e.g. Auto-assign P0 bugs"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
            />
            <Input
              label="Description (optional)"
              placeholder="Describe what this rule does"
              value={ruleDescription}
              onChange={(e) => setRuleDescription(e.target.value)}
            />

            <div className="border-t border-gray-200 pt-4">
              <TriggerSelect value={triggerType} onChange={setTriggerType} />
            </div>

            <div className="border-t border-gray-200 pt-4">
              <ConditionBuilder conditions={conditions} onChange={setConditions} />
            </div>

            <div className="border-t border-gray-200 pt-4">
              <ActionBuilder actions={actions} onChange={setActions} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!ruleName || actions.length === 0}
              isLoading={createRule.isPending || updateRule.isPending}
            >
              {editingRule ? 'Save Changes' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <ConfirmDialog
          open={!!showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(null)}
          onConfirm={() => {
            deleteRule.mutate(
              { id: showDeleteConfirm, projectId: projectKey },
              { onSuccess: () => setShowDeleteConfirm(null) },
            )
          }}
          title="Delete Automation Rule"
          description="Are you sure you want to delete this automation rule? This action cannot be undone."
          confirmLabel="Delete Rule"
          destructive
          isLoading={deleteRule.isPending}
        />
      )}

      {/* Test Rule Dialog */}
      <Dialog
        open={!!showTestDialog}
        onOpenChange={(o) => !o && setShowTestDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Test Automation Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Enter an issue ID to dry-run this rule. No changes will be made.
            </p>
            <Input
              label="Issue ID"
              placeholder="Paste an issue UUID"
              value={testIssueId}
              onChange={(e) => setTestIssueId(e.target.value)}
            />

            {testRule.data && (
              <div className="space-y-3 bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Conditions:</span>
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium',
                      testRule.data.conditionsMet
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700',
                    )}
                  >
                    {testRule.data.conditionsMet ? 'All Passed' : 'Not Met'}
                  </span>
                </div>

                {testRule.data.conditionResults.map((cr, i) => (
                  <div key={i} className="text-xs flex items-center gap-2">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        cr.passed ? 'bg-green-500' : 'bg-red-500',
                      )}
                    />
                    <span className="text-gray-600">
                      {cr.field} {cr.operator} {JSON.stringify(cr.expected)}
                    </span>
                    <span className="text-gray-500">
                      (actual: {JSON.stringify(cr.actual)})
                    </span>
                  </div>
                ))}

                {testRule.data.conditionsMet && testRule.data.actionsToExecute.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      Actions that would execute:
                    </p>
                    {testRule.data.actionsToExecute.map((action: any, i: number) => (
                      <div key={i} className="text-xs text-gray-600">
                        {action.type}: {JSON.stringify(action.config)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestDialog(null)}>
              Close
            </Button>
            <Button
              onClick={handleTest}
              disabled={!testIssueId}
              isLoading={testRule.isPending}
            >
              Run Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ProjectAutomationsPage() {
  const { key: projectKey } = useParams<{ key: string }>()
  const { data: project } = useProject(projectKey!)

  if (!projectKey) return null

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Automations"
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectKey}/board` },
          { label: 'Automations' },
        ]}
      />
      <div className="p-6">
        <AutomationsContent projectKey={projectKey} />
      </div>
    </div>
  )
}
