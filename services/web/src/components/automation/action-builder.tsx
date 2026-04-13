import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import type { AutomationAction } from '@/hooks/useAutomation'

const ACTION_OPTIONS = [
  { value: 'set_field', label: 'Set Field Value' },
  { value: 'assign_user', label: 'Assign User' },
  { value: 'transition', label: 'Transition Status' },
  { value: 'add_label', label: 'Add Label' },
  { value: 'remove_label', label: 'Remove Label' },
  { value: 'add_comment', label: 'Add Comment' },
  { value: 'notify', label: 'Send Notification' },
  { value: 'move_sprint', label: 'Move to Sprint' },
]

const SET_FIELD_OPTIONS = [
  { value: 'priority', label: 'Priority' },
  { value: 'type', label: 'Issue Type' },
  { value: 'storyPoints', label: 'Story Points' },
]

interface ActionBuilderProps {
  actions: AutomationAction[]
  onChange: (actions: AutomationAction[]) => void
}

export function ActionBuilder({ actions, onChange }: ActionBuilderProps) {
  const addAction = () => {
    onChange([...actions, { type: 'set_field', config: { field: 'priority', value: '' } }])
  }

  const updateAction = (index: number, updates: Partial<AutomationAction>) => {
    const updated = actions.map((a, i) => {
      if (i !== index) return a
      return { ...a, ...updates }
    })
    onChange(updated)
  }

  const updateActionConfig = (index: number, key: string, value: any) => {
    const updated = actions.map((a, i) => {
      if (i !== index) return a
      return { ...a, config: { ...a.config, [key]: value } }
    })
    onChange(updated)
  }

  const removeAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index))
  }

  const handleTypeChange = (index: number, type: string) => {
    const defaults: Record<string, Record<string, any>> = {
      set_field: { field: 'priority', value: '' },
      assign_user: { userId: '' },
      transition: { statusId: '' },
      add_label: { label: '' },
      remove_label: { label: '' },
      add_comment: { content: '' },
      notify: { userIds: [], message: '' },
      move_sprint: { sprintId: '' },
    }
    updateAction(index, { type, config: defaults[type] || {} })
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Then do this...
      </label>

      {actions.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          Add at least one action.
        </p>
      )}

      {actions.map((action, index) => (
        <div key={index} className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Select
                value={action.type}
                onValueChange={(v) => handleTypeChange(index, v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-gray-400 hover:text-red-600"
              onClick={() => removeAction(index)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Action-specific config */}
          {action.type === 'set_field' && (
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={action.config.field || SET_FIELD_OPTIONS[0].value}
                onValueChange={(v) => updateActionConfig(index, 'field', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SET_FIELD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Value"
                value={action.config.value ?? ''}
                onChange={(e) => updateActionConfig(index, 'value', e.target.value)}
              />
            </div>
          )}

          {action.type === 'assign_user' && (
            <Input
              placeholder="User ID"
              value={action.config.userId || ''}
              onChange={(e) => updateActionConfig(index, 'userId', e.target.value)}
            />
          )}

          {action.type === 'transition' && (
            <Input
              placeholder="Status ID"
              value={action.config.statusId || ''}
              onChange={(e) => updateActionConfig(index, 'statusId', e.target.value)}
            />
          )}

          {(action.type === 'add_label' || action.type === 'remove_label') && (
            <Input
              placeholder="Label name"
              value={action.config.label || ''}
              onChange={(e) => updateActionConfig(index, 'label', e.target.value)}
            />
          )}

          {action.type === 'add_comment' && (
            <Input
              placeholder="Comment content"
              value={action.config.content || ''}
              onChange={(e) => updateActionConfig(index, 'content', e.target.value)}
            />
          )}

          {action.type === 'notify' && (
            <div className="space-y-2">
              <Input
                placeholder="User IDs (comma separated)"
                value={(action.config.userIds || []).join(', ')}
                onChange={(e) =>
                  updateActionConfig(
                    index,
                    'userIds',
                    e.target.value
                      .split(',')
                      .map((v) => v.trim())
                      .filter(Boolean),
                  )
                }
              />
              <Input
                placeholder="Notification message"
                value={action.config.message || ''}
                onChange={(e) => updateActionConfig(index, 'message', e.target.value)}
              />
            </div>
          )}

          {action.type === 'move_sprint' && (
            <Input
              placeholder="Sprint ID"
              value={action.config.sprintId || ''}
              onChange={(e) => updateActionConfig(index, 'sprintId', e.target.value)}
            />
          )}
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addAction}>
        <Plus className="h-4 w-4" />
        Add Action
      </Button>
    </div>
  )
}
