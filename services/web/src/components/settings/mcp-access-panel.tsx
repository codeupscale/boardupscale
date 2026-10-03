import { useState } from 'react'
import { Copy, KeyRound, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useCreateMcpToken, useMcpTokens, useRevokeMcpToken } from '@/hooks/useMcpTokens'
import { formatDate, formatRelativeTime } from '@/lib/utils'
import { toast } from '@/store/ui.store'

const EXPIRY_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
  { value: '365', label: '1 year' },
]

function mcpUrl() {
  const base = import.meta.env.VITE_API_URL || '/api'
  return new URL(`${base.replace(/\/$/, '')}/mcp`, window.location.origin).toString()
}

function buildSnippets(url: string, token: string) {
  const jsonConfig = JSON.stringify(
    { mcpServers: { boardupscale: { url, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2,
  )
  return [
    {
      id: 'claude-code',
      label: 'Claude Code',
      code: `claude mcp add --transport http boardupscale ${url} --header "Authorization: Bearer ${token}"`,
    },
    { id: 'json', label: 'Cursor (~/.cursor/mcp.json) and other JSON-configured clients', code: jsonConfig },
  ]
}

function CodeBlock({ code }: { code: string }) {
  const copy = () => {
    navigator.clipboard.writeText(code)
    toast('Copied to clipboard')
  }
  return (
    <div className="relative group">
      <pre className="text-xs bg-muted rounded-lg p-3 pr-10 overflow-x-auto whitespace-pre-wrap break-all font-mono">
        {code}
      </pre>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-1.5 right-1.5"
        onClick={copy}
        aria-label="Copy"
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

export function McpAccessPanel() {
  const { data: tokens = [], isLoading } = useMcpTokens()
  const createToken = useCreateMcpToken()
  const revokeToken = useRevokeMcpToken()

  const [name, setName] = useState('')
  const [expiresInDays, setExpiresInDays] = useState('90')
  const [allowWrite, setAllowWrite] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)

  const url = mcpUrl()
  const snippets = buildSnippets(url, newToken ?? '<your-token>')

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    createToken.mutate(
      { name: name.trim(), expiresInDays: Number(expiresInDays), allowWrite },
      {
        onSuccess: (data) => {
          setNewToken(data.token)
          setName('')
          setAllowWrite(false)
        },
      },
    )
  }

  const handleRevoke = (id: string, tokenName: string) => {
    if (!window.confirm(`Revoke "${tokenName}"? Any AI tool using it will lose access immediately.`)) return
    revokeToken.mutate(id)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Connect AI assistants such as Claude Code or Cursor to Boardupscale over MCP.
        Tokens can read the projects, issues, sprints, boards and linked pull requests you can already
        see, and post comments as you. Tokens with write access can also create and edit issues — only
        where your project role allows it. Tokens never reach projects you are not a member of.
      </p>

      {/* Create */}
      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[12rem] space-y-1.5">
          <Label htmlFor="mcp-token-name">Token name</Label>
          <Input
            id="mcp-token-name"
            placeholder="e.g. Claude Code on laptop"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="w-36 space-y-1.5">
          <Label>Expires in</Label>
          <Select value={expiresInDays} onValueChange={setExpiresInDays}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={!name.trim() || createToken.isPending}>
          <Plus className="h-4 w-4" />
          Create token
        </Button>
        <div className="flex w-full items-center gap-3">
          <Switch id="mcp-token-write" checked={allowWrite} onCheckedChange={setAllowWrite} />
          <Label htmlFor="mcp-token-write" className="font-normal">
            Allow creating &amp; editing tickets{' '}
            <span className="text-muted-foreground">(limited to your project permissions)</span>
          </Label>
        </div>
      </form>

      {newToken && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            Copy this token now — it won't be shown again.
          </p>
          <CodeBlock code={newToken} />
          <Button variant="outline" size="sm" onClick={() => setNewToken(null)}>
            I've saved it
          </Button>
        </div>
      )}

      {/* Existing tokens */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Your tokens</h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">You have no active MCP tokens.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <KeyRound className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                    {t.scopes?.includes('mcp:write') ? (
                      <Badge variant="warning">Read + write</Badge>
                    ) : (
                      <Badge>Read + comment</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{t.keyPrefix}…</span> · expires {formatDate(t.expiresAt)} ·{' '}
                    {t.lastUsedAt ? `last used ${formatRelativeTime(t.lastUsedAt)}` : 'never used'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Revoke ${t.name}`}
                  disabled={revokeToken.isPending}
                  onClick={() => handleRevoke(t.id, t.name)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Setup */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Connect your AI tool</h3>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Server URL</p>
          <CodeBlock code={url} />
        </div>
        {snippets.map((s) => (
          <div key={s.id} className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <CodeBlock code={s.code} />
          </div>
        ))}
      </div>
    </div>
  )
}
