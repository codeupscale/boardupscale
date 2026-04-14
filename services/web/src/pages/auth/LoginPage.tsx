import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Mail, Eye, EyeOff, ShieldCheck, LogIn } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { useTranslation } from 'react-i18next'
import { useLogin, useVerify2FA } from '@/hooks/useAuth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { SEO } from '@/components/seo/SEO'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

type FormValues = z.infer<typeof schema>

const FEATURES = [
  { label: 'Kanban & Scrum boards',    dotClass: 'login-dot-violet' },
  { label: 'Real-time collaboration',  dotClass: 'login-dot-pink' },
  { label: 'Sprint intelligence AI',   dotClass: 'login-dot-indigo' },
  { label: 'GitHub & Jira import',     dotClass: 'login-dot-emerald' },
]

/* ── Google SVG icon ── */
function GoogleIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

/* ── GitHub SVG icon ── */
function GitHubIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

export function LoginPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const login = useLogin()
  const verify2FA = useVerify2FA()
  const [showPassword, setShowPassword] = useState(false)
  const [lockoutMessage, setLockoutMessage] = useState<string | null>(null)
  const [showVerificationNotice, setShowVerificationNotice] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [resendingVerification, setResendingVerification] = useState(false)
  const [verificationSent, setVerificationSent] = useState(false)
  const [twoFactorState, setTwoFactorState] = useState<{ tempToken: string } | null>(null)
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [ssoSlug, setSsoSlug] = useState('')
  const [showSsoInput, setShowSsoInput] = useState(false)
  const [ssoLoading, setSsoLoading] = useState(false)
  const [ssoError, setSsoError] = useState<string | null>(null)

  const samlError = searchParams.get('error')

  const handleSsoLogin = async () => {
    if (!ssoSlug.trim()) return
    setSsoLoading(true)
    setSsoError(null)
    try {
      const { data } = await api.get(`/auth/saml/status?orgSlug=${encodeURIComponent(ssoSlug.trim())}`)
      if (data.configured) {
        window.location.href = `/api/auth/saml?orgSlug=${encodeURIComponent(ssoSlug.trim())}`
      } else {
        setSsoError('SSO is not configured for this organization. Contact your administrator.')
      }
    } catch {
      setSsoError('Could not verify SSO configuration. Please check the organization identifier.')
    } finally {
      setSsoLoading(false)
    }
  }

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const handleLogin = async (values: FormValues) => {
    setLockoutMessage(null)
    setShowVerificationNotice(false)
    setVerificationSent(false)
    login.mutate(
      { email: values.email, password: values.password },
      {
        onSuccess: (data) => {
          if (data?.requiresTwoFactor && data?.tempToken) {
            setTwoFactorState({ tempToken: data.tempToken })
          }
        },
        onError: (err: any) => {
          const status = err?.response?.status
          const data = err?.response?.data
          if (status === 423) {
            setLockoutMessage(
              data?.message || 'Account is locked due to too many failed login attempts. Please try again later.'
            )
            return
          }
          if (data?.emailVerified === false || data?.message?.toLowerCase()?.includes('verify')) {
            setShowVerificationNotice(true)
            setVerificationEmail(values.email)
          }
        },
      }
    )
  }

  const handle2FAVerify = () => {
    if (!twoFactorState || !twoFactorCode) return
    verify2FA.mutate({ tempToken: twoFactorState.tempToken, code: twoFactorCode })
  }

  const handleResendVerification = async () => {
    if (!verificationEmail) return
    setResendingVerification(true)
    try {
      await api.post('/auth/send-verification')
      setVerificationSent(true)
    } catch {
      // fail silently
    } finally {
      setResendingVerification(false)
    }
  }

  /* ── 2FA Screen ─────────────────────────────────────────────── */
  if (twoFactorState) {
    return (
      <div className="dark login-gaming-bg min-h-screen flex items-center justify-center p-6 overflow-hidden">
        <SEO title="Two-Factor Authentication" noIndex />
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="relative z-10 w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center justify-center h-14 w-14 rounded-2xl mb-4"
              style={{ background: 'var(--plasma-btn-bg)', boxShadow: 'var(--plasma-btn-shadow)' }}
            >
              <ShieldCheck className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Two-Factor Auth</h1>
            <p className="text-sm text-white/45 mt-1 text-center">Enter the code from your authenticator app</p>
          </div>
          <div className="login-glass-card rounded-2xl p-7 space-y-4">
            <Input
              label="Verification Code"
              placeholder="Enter 6-digit code"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handle2FAVerify()}
            />
            {verify2FA.isError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                <p className="text-sm text-red-400">Invalid verification code. Please try again.</p>
              </div>
            )}
            <Button className="w-full plasma-btn" size="lg" onClick={handle2FAVerify} isLoading={verify2FA.isPending} disabled={!twoFactorCode}>
              Verify
            </Button>
            <button type="button" onClick={() => { setTwoFactorState(null); setTwoFactorCode('') }}
              className="w-full text-sm text-white/35 hover:text-white/60 transition-colors mt-1"
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Main Login ─────────────────────────────────────────────── */
  return (
    <div className="dark login-gaming-bg min-h-screen flex overflow-hidden">
      <SEO title="Sign In" description="Sign in to your Boardupscale account." canonical="/login" noIndex />

      {/* Global background orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      {/* ── Left brand hero panel (desktop only) ── */}
      <div className="hidden lg:flex lg:w-[52%] flex-col justify-between p-14 relative login-panel-left">
        <div className="login-grid-overlay" />

        {/* Logo */}
        <div className="relative z-10">
          <Logo size="lg" />
        </div>

        {/* Hero content */}
        <div className="relative z-10 max-w-md">
          <h2 className="text-[3.25rem] font-bold text-white leading-[1.12] tracking-tight mb-5">
            Your team's<br />
            <span className="text-gradient-plasma">command center</span>
          </h2>
          <p className="text-white/55 text-lg leading-relaxed">
            Sprints, boards, and real-time collaboration — everything your team needs to ship with confidence.
          </p>
          <div className="mt-10 space-y-4">
            {FEATURES.map(({ label, dotClass }) => (
              <div key={label} className="flex items-center gap-3.5">
                <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
                <span className="text-white/62 text-sm">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-white/25 text-xs">
          © {new Date().getFullYear()} Boardupscale. All rights reserved.
        </p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        {/* Mobile-only extra orb */}
        <div className="lg:hidden login-orb login-orb-4" />

        <div className="relative z-10 w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Logo size="lg" />
          </div>

          {/* Glass card */}
          <div className="login-glass-card rounded-2xl p-8">
            <div className="mb-7">
              <h1 className="text-2xl font-bold text-white">Welcome back</h1>
              <p className="text-white/42 text-sm mt-1">Sign in to continue to Boardupscale</p>
            </div>

            {/* OAuth buttons — always visible */}
            <div className="flex gap-3 mb-6">
              <button
                type="button"
                onClick={() => { window.location.href = '/api/auth/google' }}
                className="oauth-btn-google flex-1"
              >
                <GoogleIcon />
                <span>Google</span>
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = '/api/auth/github' }}
                className="oauth-btn-github flex-1"
              >
                <GitHubIcon />
                <span>GitHub</span>
              </button>
            </div>

            {/* Divider */}
            <div className="login-divider mb-6">or continue with email</div>

            {/* Email/password form */}
            <form onSubmit={handleSubmit(handleLogin)} className="space-y-4">
              <Input
                label={t('common.email')}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                error={errors.email?.message}
                {...register('email')}
              />

              <div>
                <div className="relative">
                  <Input
                    label={t('common.password')}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    error={errors.password?.message}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-[34px] text-white/35 hover:text-white/70 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-1.5 text-right">
                  <Link to="/forgot-password" className="text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors">
                    Forgot password?
                  </Link>
                </div>
              </div>

              {/* Account lockout */}
              {lockoutMessage && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-300">{lockoutMessage}</p>
                </div>
              )}

              {/* Email verification notice */}
              {showVerificationNotice && (
                <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg px-4 py-3">
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-violet-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-violet-300 font-medium">Email not verified</p>
                      <p className="text-sm text-violet-400 mt-1">
                        Check your inbox for a verification email.{' '}
                        {!verificationSent ? (
                          <button
                            type="button"
                            onClick={handleResendVerification}
                            disabled={resendingVerification}
                            className="underline hover:no-underline font-medium"
                          >
                            {resendingVerification ? 'Sending…' : 'Resend email'}
                          </button>
                        ) : (
                          <span className="font-medium text-emerald-400">Sent!</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Generic error */}
              {login.isError && !lockoutMessage && !showVerificationNotice && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                  <p className="text-sm text-red-400">{t('auth.invalidCredentials')}</p>
                </div>
              )}

              <Button type="submit" className="w-full plasma-btn" size="lg" isLoading={login.isPending}>
                {t('auth.signIn')}
              </Button>
            </form>

            {/* SAML error */}
            {samlError && (
              <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                <p className="text-sm text-red-400">{samlError}</p>
              </div>
            )}

            {/* SSO */}
            <div className="mt-5">
              <div className="login-divider mb-4">or</div>
              {!showSsoInput ? (
                <button
                  type="button"
                  onClick={() => setShowSsoInput(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white/55 hover:text-white/80 border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/8 transition-all"
                >
                  <LogIn className="h-4 w-4" />
                  Sign in with SSO
                </button>
              ) : (
                <div className="space-y-3">
                  <Input
                    label="Organization identifier"
                    placeholder="your-org-slug"
                    value={ssoSlug}
                    onChange={(e) => { setSsoSlug(e.target.value); setSsoError(null) }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSsoLogin()}
                    helperText="Enter your organization's URL slug to sign in via SSO"
                    autoFocus
                  />
                  {ssoError && <p className="text-sm text-red-400">{ssoError}</p>}
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={handleSsoLogin} isLoading={ssoLoading} disabled={!ssoSlug.trim()}>
                      Continue with SSO
                    </Button>
                    <Button variant="outline" onClick={() => { setShowSsoInput(false); setSsoSlug(''); setSsoError(null) }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Register link */}
          <p className="text-center text-sm text-white/35 mt-5">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
              {t('auth.createOne')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
