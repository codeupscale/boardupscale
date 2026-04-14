import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
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
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus:ring-offset-2',
          checked ? 'bg-primary' : 'bg-muted',
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
        <h2 className="text-xl font-semibold text-foreground">
          Configure Migration
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Map Jira statuses and roles to Boardupscale equivalents.
        </p>
      </div>

      {/* Status Mapping */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Status Mapping
          </h3>
          <div className="space-y-2">
            {DEFAULT_JIRA_STATUSES.map((row) => (
              <div key={row.jira} className="flex items-center gap-3">
                <div className="flex-1 text-sm text-foreground bg-muted px-3 py-2 rounded-md border border-border">
                  {row.jira}
                </div>
                <span className="text-muted-foreground text-sm flex-shrink-0">maps to</span>
                <Select value={statusMapping[row.jira] ?? row.default} onValueChange={(v) => setStatusMapping((prev) => ({ ...prev, [row.jira]: v }))}>
                  <SelectTrigger className="flex-1 text-sm" aria-label={`Map ${row.jira} to`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOARDUPSCALE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Import Options */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">
            Import Options
          </h3>
          <div className="divide-y divide-border">
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
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Role Mapping
          </h3>
          <div className="space-y-2">
            {DEFAULT_JIRA_ROLES.map((row) => (
              <div key={row.jira} className="flex items-center gap-3">
                <div className="flex-1 text-sm text-foreground bg-muted px-3 py-2 rounded-md border border-border">
                  {row.jira}
                </div>
                <span className="text-muted-foreground text-sm flex-shrink-0">maps to</span>
                <Select value={roleMapping[row.jira] ?? row.default} onValueChange={(v) => setRoleMapping((prev) => ({ ...prev, [row.jira]: v }))}>
                  <SelectTrigger className="flex-1 text-sm" aria-label={`Map ${row.jira} role to`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOARDUPSCALE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
