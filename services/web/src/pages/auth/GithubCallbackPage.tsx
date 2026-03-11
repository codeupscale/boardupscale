import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Github, Loader2 } from 'lucide-react'

/**
 * Handles the GitHub OAuth popup callback.
 * GitHub redirects here with ?code=... after the user authorizes.
 * This page sends the code back to the opener window via postMessage, then closes.
 */
export function GithubCallbackPage() {
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    if (window.opener) {
      window.opener.postMessage(
        { type: 'github-oauth-callback', code, error, errorDescription },
        window.location.origin,
      )
      window.close()
    }
  }, [searchParams])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-white dark:bg-gray-900">
      <div className="h-12 w-12 rounded-xl bg-gray-900 dark:bg-gray-700 flex items-center justify-center">
        <Github className="h-6 w-6 text-white" />
      </div>
      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Connecting to GitHub…</span>
      </div>
    </div>
  )
}
