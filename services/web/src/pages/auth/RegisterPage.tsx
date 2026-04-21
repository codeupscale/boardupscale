import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Mail, CheckCircle2 } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { useTranslation } from 'react-i18next'
import { useRegister } from '@/hooks/useAuth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SEO } from '@/components/seo/SEO'

const schema = z
  .object({
    organizationName: z.string().min(1, 'Organization name is required').max(100),
    displayName: z.string().min(2, 'Display name must be at least 2 characters').max(100),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

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

function GitHubIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

const PERKS = [
  { label: 'Free forever for small teams',  dotClass: 'login-dot-violet' },
  { label: 'No credit card required',        dotClass: 'login-dot-pink' },
  { label: 'Unlimited projects & boards',    dotClass: 'login-dot-indigo' },
  { label: 'Set up in under 2 minutes',      dotClass: 'login-dot-emerald' },
]

export function RegisterPage() {
  const { t } = useTranslation()
  const register_ = useRegister()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = (values: FormValues) => {
    register_.mutate(
      {
        organizationName: values.organizationName,
        displayName: values.displayName,
        email: values.email,
        password: values.password,
      },
      { onSuccess: () => setRegisteredEmail(values.email) },
    )
  }

  /* ── Success screen ── */
  if (registeredEmail) {
    return (
      <div className="dark login-gaming-bg min-h-screen flex items-center justify-center p-6 overflow-hidden">
        <SEO title="Check Your Email" noIndex />
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="relative z-10 w-full max-w-sm">
          <div className="flex justify-center mb-8">
            <Logo size="lg" />
          </div>
          <div className="login-glass-card rounded-2xl p-8 text-center">
            <div
              className="flex items-center justify-center h-16 w-16 rounded-2xl mx-auto mb-5"
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 0 24px #10b98155' }}
            >
              <CheckCircle2 className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Account created!</h2>
            <p className="text-sm text-white/50 mb-5">
              We've sent a verification email to
            </p>
            <div className="flex items-center justify-center gap-2 bg-violet-500/15 border border-violet-500/25 rounded-lg px-4 py-2.5 mb-5">
              <Mail className="h-4 w-4 text-violet-400 shrink-0" />
              <span className="text-sm font-medium text-violet-300 break-all">{registeredEmail}</span>
            </div>
            <p className="text-xs text-white/35 mb-6">
              Click the link in the email to activate your account. Check your spam folder if you don't see it.
            </p>
            <Link
              to="/login"
              className="plasma-btn block w-full text-sm font-semibold rounded-lg px-4 py-2.5 text-center transition-all"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  /* ── Register form ── */
  return (
    <div className="dark login-gaming-bg min-h-screen flex overflow-hidden">
      <SEO title="Create Account" description="Create your free Boardupscale account and start managing projects with AI-powered tools." canonical="/register" noIndex />

      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[52%] flex-col justify-between p-14 relative login-panel-left">
        <div className="login-grid-overlay" />
        <div className="relative z-10">
          <Logo size="lg" />
        </div>
        <div className="relative z-10 max-w-md">
          <h2 className="text-[3.25rem] font-bold text-white leading-[1.12] tracking-tight mb-5">
            Launch your team<br />
            <span className="text-gradient-plasma">in minutes</span>
          </h2>
          <p className="text-white/55 text-lg leading-relaxed">
            One workspace for your sprints, boards, and entire team — self-hosted and always in your control.
          </p>
          <div className="mt-10 space-y-4">
            {PERKS.map(({ label, dotClass }) => (
              <div key={label} className="flex items-center gap-3.5">
                <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
                <span className="text-white/62 text-sm">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-white/25 text-xs">
          © {new Date().getFullYear()} Boardupscale. All rights reserved.
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 relative overflow-y-auto">
        <div className="lg:hidden login-orb login-orb-4" />
        <div className="relative z-10 w-full max-w-[420px] py-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Logo size="lg" />
          </div>

          <div className="login-glass-card rounded-2xl p-8">
            <div className="mb-7">
              <h1 className="text-2xl font-bold text-white">Create your account</h1>
              <p className="text-white/42 text-sm mt-1">Start your free workspace today</p>
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

            <div className="login-divider mb-6">or sign up with email</div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label={t('auth.orgName')}
                placeholder="Acme Corp"
                error={errors.organizationName?.message}
                {...register('organizationName')}
              />

              <Input
                label={t('auth.displayName')}
                placeholder="John Doe"
                error={errors.displayName?.message}
                {...register('displayName')}
              />

              <Input
                label={t('common.email')}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                error={errors.email?.message}
                {...register('email')}
              />

              <div className="relative">
                <Input
                  label={t('common.password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
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

              <div className="relative">
                <Input
                  label={t('auth.confirmPassword')}
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  error={errors.confirmPassword?.message}
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-[34px] text-white/35 hover:text-white/70 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {register_.isError && (() => {
                const data = (register_.error as any)?.response?.data
                const msg =
                  (Array.isArray(data?.violations) && data.violations.length
                    ? data.violations.join('. ')
                    : undefined) ||
                  (Array.isArray(data?.details) && data.details.length
                    ? data.details.join('. ')
                    : undefined) ||
                  data?.message ||
                  t('auth.registrationFailed')
                return (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                    <p className="text-sm text-red-400">{msg}</p>
                  </div>
                )
              })()}

              <Button type="submit" className="w-full plasma-btn" size="lg" isLoading={register_.isPending}>
                {t('auth.createAccount')}
              </Button>
            </form>
          </div>

          <p className="text-center text-sm text-white/35 mt-5">
            {t('auth.hasAccount')}{' '}
            <Link to="/login" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
              {t('auth.signIn')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
