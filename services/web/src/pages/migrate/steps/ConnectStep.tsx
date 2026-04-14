import { useEffect, useState } from 'react'
import { Eye, EyeOff, ExternalLink, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { useConnectJira, ConnectJiraResult } from '@/hooks/useMigration'

interface ConnectStepProps {
  onNext: (result: ConnectJiraResult) => void
}

/**
 * ConnectStep — Step 1 of the Jira migration wizard.
 *
 * Primary flow: "Connect with Atlassian" OAuth 2.0 button.
 * Reads oauth query params on return from Atlassian and auto-advances.
 *
 * Secondary flow: Manual URL + email + API token entry (collapsible).
 */
export function ConnectStep({ onNext }: ConnectStepProps) {
  const [url, setUrl] = useState('')
  const [email, setEmail] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [result, setResult] = useState<ConnectJiraResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [oauthLoading, setOauthLoading] = useState(false)

  const connectMutation = useConnectJira()

  // Handle OAuth callback — the API redirects back with ?oauth=1&runId=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('oauth') === '1') {
      const runId = params.get('runId')
      const connectionId = params.get('connectionId') ?? undefined
      const orgName = params.get('orgName') ?? ''
      const projectCount = parseInt(params.get('projectCount') ?? '0', 10)
      const memberCount = parseInt(params.get('memberCount') ?? '0', 10)
      const oauthError = params.get('oauthError')

      if (oauthError) {
        setError(`Atlassian OAuth failed: ${oauthError}`)
        // Clean the URL
        window.history.replaceState({}, '', window.location.pathname)
        return
      }

      if (runId) {
        const oauthResult: ConnectJiraResult = {
          runId,
          connectionId,
          displayName: '',
          orgName,
          projectCount,
          memberCount,
          // Projects list will be fetched in the preview step
          projects: [],
        }
        setResult(oauthResult)
        // Clean the URL so a refresh doesn't re-trigger
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [])

  async function handleOAuthConnect() {
    setOauthLoading(true)
    setError(null)
    try {
      const { data } = await api.get<{ data: { url: string } }>('/migration/jira/oauth/authorize-url')
      window.location.href = data.data.url
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not start Atlassian login')
      setOauthLoading(false)
    }
  }

  async function handleManualTest() {
    setError(null)
    setResult(null)
    try {
      const data = await connectMutation.mutateAsync({ url, email, apiToken })
      setResult(data)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Connection failed')
    }
  }

  const isManualValid = url.trim() && email.trim() && apiToken.trim()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Connect to Jira
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your Atlassian account to begin migration. Your credentials are encrypted before storage.
        </p>
      </div>

      {/* === Primary: OAuth button === */}
      {!result && (
        <div className="space-y-3">
          <Button
            onClick={handleOAuthConnect}
            disabled={oauthLoading}
            className="w-full bg-[#0052CC] hover:bg-[#0747A6] text-white flex items-center justify-center gap-3 h-11"
          >
            {oauthLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              /* Atlassian logo — inline SVG so no external dependency */
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 32 32"
                className="h-5 w-5 flex-shrink-0"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M4.285 16.638C3.853 16.07 3.1 16.07 3.1 16.07l-2.57 3.51s-.645.886.323 1.452l7.75 4.476c.644.369 1.289.092 1.289.092l3.568-6.267c-4.551-2.617-8.582-2.71-9.175-2.694zM27.715 15.362c.432-.568 1.185-.568 1.185-.568l2.57 3.51s.645.886-.323 1.452l-7.75 4.476c-.644.369-1.289.092-1.289.092l-3.568-6.267c4.551-2.617 8.582-2.71 9.175-2.694zM16 2.46c-.97 0-1.755.784-1.755 1.755L13.07 17.75l2.93 5.143 2.93-5.143-1.175-13.535C17.755 3.244 16.97 2.46 16 2.46z"
                />
              </svg>
            )}
            {oauthLoading ? 'Redirecting to Atlassian...' : 'Connect with Atlassian'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Recommended — uses OAuth 2.0. No password or API token required.
          </p>
        </div>
      )}

      {/* === Divider === */}
      {!result && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-3 text-muted-foreground">
              or
            </span>
          </div>
        </div>
      )}

      {/* === Secondary: Manual entry (collapsible) === */}
      {!result && (
        <div>
          <button
            type="button"
            onClick={() => setManualOpen((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
            aria-expanded={manualOpen}
          >
            {manualOpen ? (
              <ChevronUp className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 flex-shrink-0" />
            )}
            Connect manually with API token
          </button>

          {manualOpen && (
            <div className="mt-4 space-y-4 border border-border rounded-lg p-4">
              {/* Jira URL */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Jira URL
                </label>
                <Input
                  type="url"
                  placeholder="https://your-org.atlassian.net"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full"
                  aria-label="Jira URL"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Jira Account Email
                </label>
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full"
                  aria-label="Jira account email"
                />
              </div>

              {/* API Token */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-foreground">
                    API Token
                  </label>
                  <a
                    href="https://id.atlassian.com/manage-profile/security/api-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    How to get an API token <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="relative">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    placeholder="Enter your Jira API token"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    className="w-full pr-10"
                    aria-label="Jira API token"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground dark:hover:text-foreground"
                    aria-label={showToken ? 'Hide token' : 'Show token'}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                onClick={handleManualTest}
                disabled={!isManualValid || connectMutation.isPending}
                className="w-full"
                variant="outline"
              >
                {connectMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Testing connection...
                  </span>
                ) : (
                  'Test Connection'
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  Connection failed
                </p>
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
                <ul className="mt-2 text-xs text-red-500 dark:text-red-400 space-y-1 list-disc pl-4">
                  <li>Check that the Jira URL is correct (e.g. https://acme.atlassian.net)</li>
                  <li>Ensure you are using your Atlassian account email, not a username</li>
                  <li>Verify the API token was copied correctly with no extra spaces</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success state */}
      {result && !error && (
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  Connected successfully
                </p>
                <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                  {result.orgName && (
                    <div>
                      <p className="text-muted-foreground text-xs">Organisation</p>
                      <p className="font-medium text-foreground capitalize">
                        {result.orgName}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground text-xs">Projects</p>
                    <p className="font-medium text-foreground">
                      {result.projectCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Members</p>
                    <p className="font-medium text-foreground">
                      {result.memberCount}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next button */}
      {result && (
        <div className="flex justify-end">
          <Button onClick={() => onNext(result)} className="px-8">
            Continue
          </Button>
        </div>
      )}
    </div>
  )
}
