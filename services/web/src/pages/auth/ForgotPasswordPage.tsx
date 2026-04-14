import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, KeyRound } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'

const schema = z.object({
  email: z.string().email('Invalid email address'),
})

type FormValues = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true)
    setError(null)
    try {
      await api.post('/auth/forgot-password', { email: values.email })
      setIsSuccess(true)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
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
            /* ── Success state ── */
            <div className="text-center py-2">
              <div
                className="flex items-center justify-center h-16 w-16 rounded-2xl mx-auto mb-6"
                style={{
                  background: 'linear-gradient(135deg, oklch(0.35 0.28 308) 0%, oklch(0.45 0.24 350) 100%)',
                  boxShadow: '0 0 28px oklch(0.45 0.24 310 / 0.45)',
                }}
              >
                <Mail className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white mb-3">Check your inbox</h2>
              <p className="text-sm text-white/50 leading-relaxed mb-8">
                If an account with that email exists, we sent a password reset link. The link will expire in 1 hour.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 font-medium transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>
            </div>
          ) : (
            /* ── Form state ── */
            <>
              <div className="flex items-center gap-4 mb-7">
                <div
                  className="flex items-center justify-center h-11 w-11 rounded-xl flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, oklch(0.25 0.20 308) 0%, oklch(0.38 0.24 340) 100%)',
                    boxShadow: '0 0 18px oklch(0.40 0.22 315 / 0.40)',
                  }}
                >
                  <KeyRound className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Reset password</h1>
                  <p className="text-white/42 text-sm mt-0.5">We'll send a reset link to your email</p>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  label="Email address"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  error={errors.email?.message}
                  {...register('email')}
                />

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                <Button type="submit" className="w-full plasma-btn" size="lg" isLoading={isSubmitting}>
                  Send reset link
                </Button>
              </form>
            </>
          )}
        </div>

        {!isSuccess && (
          <p className="text-center text-sm text-white/35 mt-5">
            <Link
              to="/login"
              className="inline-flex items-center gap-1 text-violet-400 hover:text-violet-300 font-medium transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to login
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
