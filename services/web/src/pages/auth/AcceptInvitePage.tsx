import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Zap, Eye, EyeOff, AlertCircle, Check, X } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { toast } from '@/store/ui.store'
import api from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Password rules (must mirror PasswordPolicyService on the backend) ────────

interface PasswordRule {
  key: string
  label: string
  test: (v: string) => boolean
}

const PASSWORD_RULES: PasswordRule[] = [
  { key: 'minLength',  label: 'At least 8 characters',       test: (v) => v.length >= 8 },
  { key: 'uppercase',  label: 'One uppercase letter (A–Z)',   test: (v) => /[A-Z]/.test(v) },
  { key: 'lowercase',  label: 'One lowercase letter (a–z)',   test: (v) => /[a-z]/.test(v) },
  { key: 'number',     label: 'One number (0–9)',             test: (v) => /[0-9]/.test(v) },
  { key: 'special',    label: 'One special character (!@#…)', test: (v) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(v) },
]

function getStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length
  if (passed <= 1) return 1
  if (passed === 2) return 2
  if (passed === 3 || passed === 4) return 3
  return 4
}

const STRENGTH_META = [
  null,
  { label: 'Weak',   bar: 'w-1/4',  color: 'bg-red-500',    text: 'text-red-500'    },
  { label: 'Fair',   bar: 'w-2/4',  color: 'bg-orange-400', text: 'text-orange-400' },
  { label: 'Good',   bar: 'w-3/4',  color: 'bg-blue-500',   text: 'text-blue-500'   },
  { label: 'Strong', bar: 'w-full', color: 'bg-green-500',   text: 'text-green-600'  },
] as const

// ── Zod schema — full client-side enforcement to avoid unnecessary API round-trips

const schema = z
  .object({
    displayName: z.string().min(1, 'Display name is required').max(100),
    password: z
      .string()
      .min(8, 'At least 8 characters required')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[a-z]/, 'Must contain a lowercase letter')
      .regex(/[0-9]/, 'Must contain a number')
      .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/, 'Must contain a special character'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

// ── Error screens ─────────────────────────────────────────────────────────────

const ERROR_SCREENS: Record<string, { heading: string; body: string; cta: boolean }> = {
  INVITE_ALREADY_ACCEPTED: {
    heading: 'Already Accepted',
    body: 'Your account is already active.',
    cta: true,
  },
  INVITE_EXPIRED: {
    heading: 'Invite Expired',
    body: 'This invite expired after 7 days. Ask your admin to resend it.',
    cta: true,
  },
  INVITE_INVALID: {
    heading: 'Invalid Link',
    body: 'This invite link is invalid or has already been used.',
    cta: true,
  },
  INVITE_NOT_SENT: {
    heading: 'No Invite Sent',
    body: "Your admin hasn't sent an invitation yet. Contact them to get access.",
    cta: false,
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()
  const setTokens = useAuthStore((s) => s.setTokens)

  const [validating, setValidating] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [errorCode, setErrorCode] = useState('')
  const [passwordFocused, setPasswordFocused] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const passwordValue = useWatch({ control, name: 'password', defaultValue: '' })
  const strength = getStrength(passwordValue ?? '')
  const strengthMeta = strength > 0 ? STRENGTH_META[strength] : null
  const showStrengthUI = (passwordFocused || (passwordValue?.length ?? 0) > 0)

  useEffect(() => {
    if (!token) {
      setError('No invitation token provided')
      setValidating(false)
      return
    }
    api
      .get(`/auth/validate-invite?token=${encodeURIComponent(token)}`)
      .then(({ data }) => {
        setInviteEmail(data.data?.email || data.email || '')
        setOrgName(data.data?.organizationName || data.organizationName || '')
      })
      .catch((err) => {
        const code: string =
          err?.response?.data?.code || err?.response?.data?.data?.code || 'INVITE_INVALID'
        setErrorCode(code)
        setError(
          err?.response?.data?.message ||
            err?.response?.data?.data?.message ||
            'Invalid or expired invitation link',
        )
      })
      .finally(() => setValidating(false))
  }, [token])

  const onSubmit = async (values: FormValues) => {
    setError('')
    setSubmitting(true)
    try {
      const { data } = await api.post('/auth/accept-invite', {
        token,
        password: values.password,
        displayName: values.displayName,
      })
      const result = data.data || data
      setTokens(result.accessToken, result.refreshToken)
      toast('Welcome! Your account is now active.')
      navigate('/')
    } catch (err: any) {
      const code: string =
        err?.response?.data?.code || err?.response?.data?.data?.code || 'INVITE_INVALID'
      setErrorCode(code)
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.violations?.join('. ') ||
        'Failed to accept invitation'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (validating) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Validating invitation…</p>
        </div>
      </div>
    )
  }

  // ── Error state (invalid/expired token) ───────────────────────────────────
  if (!validating && (errorCode || error) && !inviteEmail) {
    const screen = ERROR_SCREENS[errorCode] ?? ERROR_SCREENS['INVITE_INVALID']
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center justify-center h-12 w-12 bg-red-100 rounded-xl mx-auto mb-4">
            <AlertCircle className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">{screen.heading}</h2>
          <p className="text-sm text-muted-foreground mb-6">{screen.body}</p>
          {screen.cta && (
            <Link to="/login" className="text-primary hover:text-primary text-sm font-medium">
              Go to Login
            </Link>
          )}
        </div>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo + heading */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center h-12 w-12 bg-primary rounded-xl mb-3 shadow-md">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Join {orgName || "Rohail Butt's Workspace"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set up your account for <strong>{inviteEmail}</strong>
          </p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl shadow-sm border border-border p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Display name */}
            <Input
              label="Display Name"
              placeholder="John Doe"
              error={errors.displayName?.message}
              {...register('displayName')}
            />

            {/* Password */}
            <div className="space-y-2">
              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  error={errors.password?.message}
                  {...register('password')}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-[34px] text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Strength meter — only shown when field has been touched */}
              {showStrengthUI && (
                <div className="space-y-2 pt-0.5">
                  {/* Bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-300',
                          strengthMeta?.color ?? 'w-0',
                          strengthMeta?.bar ?? 'w-0',
                        )}
                      />
                    </div>
                    {strengthMeta && (
                      <span className={cn('text-xs font-medium w-12 text-right', strengthMeta.text)}>
                        {strengthMeta.label}
                      </span>
                    )}
                  </div>

                  {/* Requirements checklist */}
                  <ul className="space-y-1">
                    {PASSWORD_RULES.map((rule) => {
                      const passed = rule.test(passwordValue ?? '')
                      return (
                        <li key={rule.key} className="flex items-center gap-2">
                          <span
                            className={cn(
                              'flex-shrink-0 flex items-center justify-center h-4 w-4 rounded-full transition-colors',
                              passed
                                ? 'bg-green-100 text-green-600'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {passed ? (
                              <Check className="h-2.5 w-2.5 stroke-[2.5]" />
                            ) : (
                              <X className="h-2.5 w-2.5 stroke-[2.5]" />
                            )}
                          </span>
                          <span
                            className={cn(
                              'text-xs transition-colors',
                              passed ? 'text-green-600' : 'text-muted-foreground',
                            )}
                          >
                            {rule.label}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="relative">
              <Input
                label="Confirm Password"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Repeat your password"
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-[34px] text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Server-side error (e.g. token already used after form submit) */}
            {error && inviteEmail && (
              <div className="flex gap-2.5 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={submitting}
            >
              Accept Invitation
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:text-primary font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
