import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ConfigureStepProps {
  onNext: (config: {
    statusMapping: Record<string, string>
    options: { importComments: boolean; importAttachments: boolean; inviteMembers: boolean }
    roleMapping: Record<string, string>
  }) => void
  onBack: () => void
}

const DEFAULT_JIRA_STATUSES = [
  { jira: 'To Do', default: 'To Do' },
  { jira: 'In Progress', default: 'In Progress' },
  { jira: 'Done', default: 'Done' },
  { jira: 'Backlog', default: 'To Do' },
  { jira: 'In Review', default: 'In Progress' },
  { jira: 'Blocked', default: 'In Progress' },
]

const BOARDUPSCALE_STATUSES = ['To Do', 'In Progress', 'Done', 'Cancelled']

const DEFAULT_JIRA_ROLES = [
  { jira: 'Project Lead', default: 'manager' },
  { jira: 'Developer', default: 'member' },
  { jira: 'Viewer', default: 'viewer' },
]

const BOARDUPSCALE_ROLES = ['admin', 'manager', 'member', 'viewer']

interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}

function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700',
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  )
}

export function ConfigureStep({ onNext, onBack }: ConfigureStepProps) {
  const [statusMapping, setStatusMapping] = useState<Record<string, string>>(
    Object.fromEntries(DEFAULT_JIRA_STATUSES.map((s) => [s.jira, s.default])),
  )
  const [roleMapping, setRoleMapping] = useState<Record<string, string>>(
    Object.fromEntries(DEFAULT_JIRA_ROLES.map((r) => [r.jira, r.default])),
  )
  const [importComments, setImportComments] = useState(true)
  const [importAttachments, setImportAttachments] = useState(false)
  const [inviteMembers, setInviteMembers] = useState(true)

  function handleContinue() {
    onNext({
      statusMapping,
      roleMapping,
      options: { importComments, importAttachments, inviteMembers },
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Configure Migration
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Map Jira statuses and roles to Boardupscale equivalents.
        </p>
      </div>

      {/* Status Mapping */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Status Mapping
          </h3>
          <div className="space-y-2">
            {DEFAULT_JIRA_STATUSES.map((row) => (
              <div key={row.jira} className="flex items-center gap-3">
                <div className="flex-1 text-sm text-foreground bg-muted px-3 py-2 rounded-md border border-border">
                  {row.jira}
                </div>
                <span className="text-gray-400 text-sm flex-shrink-0">maps to</span>
                <select
                  value={statusMapping[row.jira] ?? row.default}
                  onChange={(e) =>
                    setStatusMapping((prev) => ({ ...prev, [row.jira]: e.target.value }))
                  }
                  className="flex-1 text-sm bg-card border border-border rounded-md px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={`Map ${row.jira} to`}
                >
                  {BOARDUPSCALE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Import Options */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
            Import Options
          </h3>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            <Toggle
              checked={importComments}
              onChange={setImportComments}
              label="Import Comments"
              description="Migrate all Jira issue comments into Boardupscale"
            />
            <Toggle
              checked={importAttachments}
              onChange={setImportAttachments}
              label="Import Attachments"
              description="Download and re-upload attachments (increases migration time)"
            />
            <Toggle
              checked={inviteMembers}
              onChange={setInviteMembers}
              label="Invite Members by Email"
              description="Create user accounts for Jira users not already in Boardupscale"
            />
          </div>
        </CardContent>
      </Card>

      {/* Role Mapping */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Role Mapping
          </h3>
          <div className="space-y-2">
            {DEFAULT_JIRA_ROLES.map((row) => (
              <div key={row.jira} className="flex items-center gap-3">
                <div className="flex-1 text-sm text-foreground bg-muted px-3 py-2 rounded-md border border-border">
                  {row.jira}
                </div>
                <span className="text-gray-400 text-sm flex-shrink-0">maps to</span>
                <select
                  value={roleMapping[row.jira] ?? row.default}
                  onChange={(e) =>
                    setRoleMapping((prev) => ({ ...prev, [row.jira]: e.target.value }))
                  }
                  className="flex-1 text-sm bg-card border border-border rounded-md px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={`Map ${row.jira} role to`}
                >
                  {BOARDUPSCALE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleContinue}>Start Migration</Button>
      </div>
    </div>
  )
}
