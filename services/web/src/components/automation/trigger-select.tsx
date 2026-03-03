import { Select } from '@/components/ui/select'

const TRIGGER_OPTIONS = [
  { value: 'issue.created', label: 'Issue Created' },
  { value: 'issue.updated', label: 'Issue Updated' },
  { value: 'issue.status_changed', label: 'Issue Status Changed' },
  { value: 'issue.assigned', label: 'Issue Assigned' },
  { value: 'issue.priority_changed', label: 'Issue Priority Changed' },
  { value: 'comment.added', label: 'Comment Added' },
  { value: 'sprint.started', label: 'Sprint Started' },
  { value: 'sprint.completed', label: 'Sprint Completed' },
]

const TRIGGER_DESCRIPTIONS: Record<string, string> = {
  'issue.created': 'Fires when a new issue is created in the project.',
  'issue.updated': 'Fires when any field on an issue is updated.',
  'issue.status_changed': 'Fires when an issue transitions to a new status.',
  'issue.assigned': 'Fires when an issue is assigned or reassigned.',
  'issue.priority_changed': 'Fires when an issue priority is changed.',
  'comment.added': 'Fires when a new comment is added to an issue.',
  'sprint.started': 'Fires when a sprint is started.',
  'sprint.completed': 'Fires when a sprint is completed.',
}

interface TriggerSelectProps {
  value: string
  onChange: (value: string) => void
}

export function TriggerSelect({ value, onChange }: TriggerSelectProps) {
  return (
    <div>
      <Select
        label="When this happens..."
        options={TRIGGER_OPTIONS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Select a trigger"
      />
      {value && (
        <p className="mt-1.5 text-xs text-gray-500">
          {TRIGGER_DESCRIPTIONS[value]}
        </p>
      )}
    </div>
  )
}

export { TRIGGER_OPTIONS }
