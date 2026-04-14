import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle, Mail } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Spinner } from '@/components/ui/spinner'
import api from '@/lib/api'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [countdown, setCountdown] = useState(3)
  const calledRef = useRef(false)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMessage('Missing verification token.')
      return
    }
    // Prevent double-call in React strict mode
    if (calledRef.current) return
    calledRef.current = true

    api
      .get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => setStatus('success'))
      .catch((err: any) => {
        setStatus('error')
        setErrorMessage(
          err?.response?.data?.message ||
            'Verification failed. The token may be invalid or expired.',
        )
      })
  }, [token])

  // Auto-redirect after success
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
    <div className="dark login-gaming-bg min-h-screen flex items-center justify-center p-6 overflow-hidden">
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="flex justify-center mb-8">
          <Logo size="lg" />
        </div>

        <div className="login-glass-card rounded-2xl p-8 text-center">
          {/* Loading */}
          {status === 'loading' && (
            <div className="py-6">
              <div
                className="flex items-center justify-center h-16 w-16 rounded-2xl mx-auto mb-6"
                style={{
                  background: 'linear-gradient(135deg, oklch(0.22 0.18 308) 0%, oklch(0.35 0.22 340) 100%)',
                  boxShadow: '0 0 24px oklch(0.40 0.20 315 / 0.40)',
                }}
              >
                <Mail className="h-8 w-8 text-white/80" />
              </div>
              <Spinner className="h-7 w-7 mx-auto mb-4 text-violet-400" />
              <h2 className="text-xl font-bold text-white mb-2">Verifying your email</h2>
              <p className="text-sm text-white/45">Just a moment…</p>
            </div>
          )}

          {/* Success */}
          {status === 'success' && (
            <div className="py-2">
              <div
                className="flex items-center justify-center h-16 w-16 rounded-2xl mx-auto mb-6"
                style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 0 28px #10b98155' }}
              >
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white mb-3">Email verified!</h2>
              <p className="text-sm text-white/50 leading-relaxed mb-2">
                Your email has been verified. You now have full access to Boardupscale.
              </p>
              <p className="text-xs text-white/30 mb-7">
                Redirecting to login in {countdown} second{countdown !== 1 ? 's' : ''}…
              </p>
              <Link
                to="/login"
                className="plasma-btn inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold w-full transition-all"
              >
                Go to login
              </Link>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="py-2">
              <div
                className="flex items-center justify-center h-16 w-16 rounded-2xl mx-auto mb-6"
                style={{ background: 'linear-gradient(135deg, #ef444430 0%, #dc262630 100%)', border: '1px solid #ef444435' }}
              >
                <XCircle className="h-8 w-8 text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-3">Verification failed</h2>
              <p className="text-sm text-white/50 leading-relaxed mb-7">{errorMessage}</p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 w-full px-6 py-2.5 rounded-lg border border-white/12 text-sm font-medium text-white/60 hover:text-white/80 hover:border-white/20 bg-white/5 hover:bg-white/8 transition-all"
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
