import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, LockKeyhole, Eye, EyeOff } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'

const schema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least 1 uppercase letter')
      .regex(/[a-z]/, 'Must contain at least 1 lowercase letter')
      .regex(/[0-9]/, 'Must contain at least 1 number')
      .regex(
        /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/,
        'Must contain at least 1 special character',
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

const ICON_STYLE = {
  background: 'linear-gradient(135deg, oklch(0.25 0.20 308) 0%, oklch(0.38 0.24 340) 100%)',
  boxShadow: '0 0 18px oklch(0.40 0.22 315 / 0.40)',
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values: FormValues) => {
    if (!token) {
      setError('Missing reset token. Please use the link from your email.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      await api.post('/auth/reset-password', { token, newPassword: values.newPassword })
      setIsSuccess(true)
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.violations?.join('. ') ||
        'Something went wrong. Please try again.'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  /* ── Invalid/missing token ── */
  if (!token) {
    return (
      <div className="dark login-gaming-bg min-h-screen flex items-center justify-center p-6 overflow-hidden">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="relative z-10 w-full max-w-[420px]">
          <div className="flex justify-center mb-8">
            <Logo size="lg" />
          </div>
          <div className="login-glass-card rounded-2xl p-8 text-center">
            <div
              className="flex items-center justify-center h-16 w-16 rounded-2xl mx-auto mb-6"
              style={{ background: 'linear-gradient(135deg, #ef444455 0%, #dc262655 100%)', border: '1px solid #ef444440' }}
            >
              <LockKeyhole className="h-8 w-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Invalid reset link</h2>
            <p className="text-sm text-white/50 mb-6">
              This link is invalid or has expired. Please request a new password reset.
            </p>
            <Link
              to="/forgot-password"
              className="inline-flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 font-medium transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Request new link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dark login-gaming-bg min-h-screen flex items-center justify-center p-6 overflow-hidden">
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="flex justify-center mb-8">
          <Logo size="lg" />
        </div>

        <div className="login-glass-card rounded-2xl p-8">
          {isSuccess ? (
            /* ── Success ── */
            <div className="text-center py-2">
              <div
                className="flex items-center justify-center h-16 w-16 rounded-2xl mx-auto mb-6"
                style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 0 28px #10b98155' }}
              >
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white mb-3">Password updated</h2>
              <p className="text-sm text-white/50 leading-relaxed mb-8">
                Your password has been reset. You can now sign in with your new password.
              </p>
              <Link
                to="/login"
                className="plasma-btn inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all"
              >
                Go to login
              </Link>
            </div>
          ) : (
            /* ── Form ── */
            <>
              <div className="flex items-center gap-4 mb-7">
                <div className="flex items-center justify-center h-11 w-11 rounded-xl flex-shrink-0" style={ICON_STYLE}>
                  <LockKeyhole className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Set new password</h1>
                  <p className="text-white/42 text-sm mt-0.5">Must include upper, lower, number & symbol</p>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="relative">
                  <Input
                    label="New Password"
                    type={showNew ? 'text' : 'password'}
                    placeholder="Enter new password"
                    autoComplete="new-password"
                    error={errors.newPassword?.message}
                    {...register('newPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-[34px] text-white/35 hover:text-white/70 transition-colors"
                    tabIndex={-1}
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <div className="relative">
                  <Input
                    label="Confirm Password"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                    error={errors.confirmPassword?.message}
                    {...register('confirmPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-[34px] text-white/35 hover:text-white/70 transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                <Button type="submit" className="w-full plasma-btn" size="lg" isLoading={isSubmitting}>
                  Reset password
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
