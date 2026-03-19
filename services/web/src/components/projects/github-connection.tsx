import { useState, useEffect, useCallback } from 'react'
import { Github, ExternalLink, Loader2, Search, Lock, Globe, CheckCircle2, AlertCircle, Webhook, RefreshCw } from 'lucide-react'
import { useGithubConnection, useConnectGithub, useDisconnectGithub, useGithubOAuthExchange, useVerifyWebhook, GitHubRepo } from '@/hooks/useGithub'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { formatDate, cn } from '@/lib/utils'
import api from '@/lib/api'

interface GitHubConnectionProps {
  projectId: string
}

// The frontend callback URL GitHub redirects to after OAuth
const GITHUB_CALLBACK_URL = `${window.location.origin}/github/callback`

export function GitHubConnection({ projectId }: GitHubConnectionProps) {
  const { data: connection, isLoading } = useGithubConnection(projectId)
  const connectGithub = useConnectGithub()
  const disconnectGithub = useDisconnectGithub()
  const exchangeCode = useGithubOAuthExchange()
  const verifyWebhook = useVerifyWebhook()

  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [accessToken, setAccessToken] = useState<string>('')
  const [search, setSearch] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [oauthError, setOauthError] = useState<string | null>(null)
  const [isOauthLoading, setIsOauthLoading] = useState(false)
  const [showDisconnect, setShowDisconnect] = useState(false)

  // Listen for the popup postMessage from GithubCallbackPage
  const handleOAuthMessage = useCallback(
    async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'github-oauth-callback') return

      const { code, error, errorDescription } = event.data

      if (error) {
        setOauthError(errorDescription || 'GitHub authorization was denied.')
        setIsOauthLoading(false)
        return
      }

      if (!code) return

      try {
        const result = await exchangeCode.mutateAsync({ code, redirectUri: GITHUB_CALLBACK_URL })
        setAccessToken(result.accessToken)
        setRepos(result.repos)
        setOauthError(null)
      } catch (err: any) {
        setOauthError(err?.response?.data?.message || 'Failed to exchange GitHub code. Try again.')
      } finally {
        setIsOauthLoading(false)
      }
    },
    [exchangeCode],
  )

  useEffect(() => {
    window.addEventListener('message', handleOAuthMessage)
    return () => window.removeEventListener('message', handleOAuthMessage)
  }, [handleOAuthMessage])

  const handleLoginWithGitHub = async () => {
    setOauthError(null)
    setIsOauthLoading(true)

    try {
      const { data } = await api.get('/github/oauth/url', {
        params: { redirectUri: GITHUB_CALLBACK_URL },
      })
      const url: string = data.data.url

      const popup = window.open(
        url,
        'github-oauth',
        'width=700,height=600,left=200,top=100,resizable=yes,scrollbars=yes',
      )

      if (!popup) {
        window.location.href = url
      }
    } catch (err: any) {
      const status = err?.response?.status
      const serverMsg = err?.response?.data?.message
      if (status === 401) {
        setOauthError('Session expired. Please log out and log back in, then try again.')
      } else {
        setOauthError(serverMsg || 'Could not generate GitHub OAuth URL. Please try again or contact support.')
      }
      setIsOauthLoading(false)
    }
  }

  const handleConnectRepo = () => {
    if (!selectedRepo) return
    connectGithub.mutate({
      projectId,
      repoOwner: selectedRepo.owner,
      repoName: selectedRepo.name,
      accessToken: accessToken || undefined,
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )
  }

  // ── Connected state ──
  if (connection) {
    const repoUrl = `https://github.com/${connection.repoOwner}/${connection.repoName}`

    return (
      <div>
        <SectionHeader />

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
                <Github className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1"
                  >
                    {connection.repoOwner}/{connection.repoName}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <Badge variant="success">Connected</Badge>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Connected on {formatDate(connection.createdAt)}
                </p>
              </div>
            </div>
          </div>

          {/* Webhook status */}
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Webhook className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Webhook</span>
                {connection.webhookActive ? (
                  <Badge variant="success" className="text-[10px]">Active</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Not registered</Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => verifyWebhook.mutate(projectId)}
                disabled={verifyWebhook.isPending}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', verifyWebhook.isPending && 'animate-spin')} />
                Verify
              </Button>
            </div>
            {connection.webhookActive && (
              <p className="text-xs text-gray-400 mt-2">
                Commits and PRs mentioning issue keys (e.g. <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">PROJ-123</code>) are linked automatically.
              </p>
            )}
            {!connection.webhookActive && (
              <p className="text-xs text-amber-500 mt-2">
                Webhook was not auto-registered. This can happen if the OAuth token lacks admin permissions.
                You can manually add a webhook in GitHub repo settings pointing to your API's <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">/api/github/webhook</code> endpoint.
              </p>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <Button variant="destructive" size="sm" onClick={() => setShowDisconnect(true)}>
              Disconnect Repository
            </Button>
          </div>
        </div>

        <ConfirmDialog
          open={showDisconnect}
          onClose={() => setShowDisconnect(false)}
          onConfirm={() =>
            disconnectGithub.mutate(projectId, { onSuccess: () => setShowDisconnect(false) })
          }
          title="Disconnect GitHub Repository"
          description={`Are you sure you want to disconnect ${connection.repoOwner}/${connection.repoName}? The webhook will be removed from GitHub and no new events will be received. Existing events linked to issues will be preserved.`}
          confirmLabel="Disconnect"
          destructive
          isLoading={disconnectGithub.isPending}
        />
      </div>
    )
  }

  const filteredRepos = repos.filter(
    (r) =>
      r.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (r.description?.toLowerCase() || '').includes(search.toLowerCase()),
  )

  // ── Repo picker (after OAuth) ──
  if (repos.length > 0) {
    return (
      <div>
        <SectionHeader />

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Search header */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Search repositories…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Repo list */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
            {filteredRepos.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">No repositories found</div>
            ) : (
              filteredRepos.map((repo) => {
                const isSelected = selectedRepo?.id === repo.id
                return (
                  <button
                    key={repo.id}
                    type="button"
                    onClick={() => setSelectedRepo(isSelected ? null : repo)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                    )}
                  >
                    {repo.private ? (
                      <Lock className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    ) : (
                      <Globe className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {repo.fullName}
                      </p>
                      {repo.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {repo.description}
                        </p>
                      )}
                    </div>
                    {repo.private && (
                      <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                        Private
                      </Badge>
                    )}
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => { setRepos([]); setSelectedRepo(null); setAccessToken('') }}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              ← Back
            </button>
            <Button
              disabled={!selectedRepo}
              isLoading={connectGithub.isPending}
              onClick={handleConnectRepo}
            >
              <Github className="h-4 w-4" />
              Connect {selectedRepo ? `${selectedRepo.owner}/${selectedRepo.name}` : 'Repository'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Initial state — Login with GitHub ──
  return (
    <div>
      <SectionHeader />

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex flex-col items-center text-center gap-4 py-4">
          <div className="h-14 w-14 rounded-2xl bg-gray-900 dark:bg-gray-700 flex items-center justify-center">
            <Github className="h-7 w-7 text-white" />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Connect a GitHub Repository
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
              Log in with GitHub to browse and select a repository. A webhook will be
              registered automatically — pull requests and commits mentioning issue keys
              (e.g. <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">PROJ-123</code>) will be linked to your issues.
            </p>
          </div>

          {oauthError && (
            <div className="flex items-start gap-2 text-left w-full max-w-sm p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 dark:text-red-400">{oauthError}</p>
            </div>
          )}

          <Button
            onClick={handleLoginWithGitHub}
            isLoading={isOauthLoading || exchangeCode.isPending}
            className="gap-2"
          >
            <Github className="h-4 w-4" />
            Login with GitHub
          </Button>
        </div>
      </div>
    </div>
  )
}

function SectionHeader() {
  return (
    <div className="flex items-start gap-3 mb-6">
      <Github className="h-5 w-5 text-gray-700 dark:text-gray-300 mt-0.5 flex-shrink-0" />
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">GitHub Integration</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Connect a GitHub repository to automatically track commits and pull requests linked to your issues.
        </p>
      </div>
    </div>
  )
}
