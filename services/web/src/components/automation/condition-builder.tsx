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
import type { AutomationCondition } from '@/hooks/useAutomation'

const FIELD_OPTIONS = [
  { value: 'type', label: 'Issue Type' },
  { value: 'priority', label: 'Priority' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'labels', label: 'Labels' },
  { value: 'storyPoints', label: 'Story Points' },
  { value: 'statusId', label: 'Status' },
  { value: 'sprintId', label: 'Sprint' },
]

const OPERATOR_OPTIONS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Does not equal' },
  { value: 'in', label: 'Is one of' },
  { value: 'not_in', label: 'Is not one of' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'is_empty', label: 'Is empty' },
  { value: 'is_not_empty', label: 'Is not empty' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
]

const NO_VALUE_OPERATORS = ['is_empty', 'is_not_empty']

interface ConditionBuilderProps {
  conditions: AutomationCondition[]
  onChange: (conditions: AutomationCondition[]) => void
}

export function ConditionBuilder({ conditions, onChange }: ConditionBuilderProps) {
  const addCondition = () => {
    onChange([...conditions, { field: 'type', operator: 'equals', value: '' }])
  }

  const updateCondition = (index: number, updates: Partial<AutomationCondition>) => {
    const updated = conditions.map((c, i) => (i === index ? { ...c, ...updates } : c))
    onChange(updated)
  }

  const removeCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        If these conditions are met...
      </label>

      {conditions.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          No conditions -- rule will always execute when triggered.
        </p>
      )}

      {conditions.map((condition, index) => (
        <div key={index} className="flex items-start gap-2">
          <div className="flex-1 grid grid-cols-3 gap-2">
            <Select
              value={condition.field}
              onValueChange={(v) => updateCondition(index, { field: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={condition.operator}
              onValueChange={(v) => updateCondition(index, { operator: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATOR_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!NO_VALUE_OPERATORS.includes(condition.operator) && (
              <Input
                placeholder="Value"
                value={
                  Array.isArray(condition.value)
                    ? condition.value.join(', ')
                    : condition.value ?? ''
                }
                onChange={(e) => {
                  const raw = e.target.value
                  // If operator expects array, split by comma
                  if (['in', 'not_in'].includes(condition.operator)) {
                    updateCondition(index, {
                      value: raw.split(',').map((v) => v.trim()).filter(Boolean),
                    })
                  } else if (['greater_than', 'less_than'].includes(condition.operator)) {
                    const num = parseFloat(raw)
                    updateCondition(index, { value: isNaN(num) ? raw : num })
                  } else {
                    updateCondition(index, { value: raw })
                  }
                }}
              />
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-gray-400 hover:text-red-600 mt-1"
            onClick={() => removeCondition(index)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addCondition}>
        <Plus className="h-4 w-4" />
        Add Condition
      </Button>
    </div>
  )
}
