import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { Zap, CheckCircle, XCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import api from '@/lib/api'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [countdown, setCountdown] = useState(3)
  const calledRef = useRef(false)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMessage('Missing verification token.')
      return
    }

    // Prevent double-call in React strict mode (dev) which would
    // consume the token on the first call and fail on the second.
    if (calledRef.current) return
    calledRef.current = true

    api
      .get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => {
        setStatus('success')
      })
      .catch((err: any) => {
        setStatus('error')
        setErrorMessage(
          err?.response?.data?.message ||
            'Verification failed. The token may be invalid or expired.'
        )
      })
  }, [token])

  // Auto-redirect to login after successful verification
  useEffect(() => {
    if (status !== 'success') return
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          navigate('/login')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [status, navigate])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center h-12 w-12 bg-primary rounded-xl mb-3 shadow-md">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Boardupscale</h1>
          <p className="text-sm text-muted-foreground mt-1">Email Verification</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl shadow-sm border border-border p-6 text-center">
          {status === 'loading' && (
            <div className="py-8">
              <Spinner className="h-8 w-8 mx-auto mb-4 text-primary" />
              <p className="text-sm text-muted-foreground">
                Verifying your email address...
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="py-4">
              <div className="flex items-center justify-center h-12 w-12 bg-green-100 rounded-full mx-auto mb-4">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                Email verified
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Your email address has been verified successfully. You can now
                use all features of Boardupscale.
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Redirecting to login in {countdown} second{countdown !== 1 ? 's' : ''}...
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Go to login
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="py-4">
              <div className="flex items-center justify-center h-12 w-12 bg-red-100 rounded-full mx-auto mb-4">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">
                Verification failed
              </h2>
              <p className="text-sm text-muted-foreground mb-6">{errorMessage}</p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Go to login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
