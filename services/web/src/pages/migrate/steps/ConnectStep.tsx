import { useState } from 'react'
import { Eye, EyeOff, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useConnectJira, ConnectJiraResult } from '@/hooks/useMigration'

interface ConnectStepProps {
  onNext: (result: ConnectJiraResult) => void
}

export function ConnectStep({ onNext }: ConnectStepProps) {
  const [url, setUrl] = useState('')
  const [email, setEmail] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [result, setResult] = useState<ConnectJiraResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const connectMutation = useConnectJira()

  async function handleTest() {
    setError(null)
    setResult(null)
    try {
      const data = await connectMutation.mutateAsync({ url, email, apiToken })
      setResult(data)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Connection failed')
    }
  }

  const isValid = url.trim() && email.trim() && apiToken.trim()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Connect to Jira
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Enter your Jira credentials to begin migration. Your API token is encrypted before storage.
        </p>
      </div>

      <div className="space-y-4">
        {/* Jira URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              API Token
            </label>
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              How to get API token <ExternalLink className="h-3 w-3" />
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label={showToken ? 'Hide token' : 'Show token'}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Test Connection Button */}
      <Button
        onClick={handleTest}
        disabled={!isValid || connectMutation.isPending}
        className="w-full"
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
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Organisation</p>
                    <p className="font-medium text-gray-900 dark:text-white capitalize">
                      {result.orgName}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Projects</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {result.projectCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Members</p>
                    <p className="font-medium text-gray-900 dark:text-white">
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
