import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'

export function SamlCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setTokens = useAuthStore((s) => s.setTokens)
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    const token = searchParams.get('token')
    const refreshToken = searchParams.get('refreshToken')

    if (token && refreshToken) {
      setTokens(token, refreshToken)
      navigate('/', { replace: true })
    } else {
      const error = searchParams.get('error')
      navigate(
        `/login${error ? `?error=${encodeURIComponent(error)}` : ''}`,
        { replace: true },
      )
    }
  }, [searchParams, setTokens, navigate])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="flex flex-col items-center">
        <div className="flex items-center justify-center h-12 w-12 bg-blue-600 rounded-xl mb-4 shadow-md">
          <Shield className="h-7 w-7 text-white" />
        </div>
        <p className="text-gray-600 text-sm">Completing SSO sign-in...</p>
      </div>
    </div>
  )
}
