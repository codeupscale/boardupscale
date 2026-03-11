import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Zap, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { toast } from '@/store/ui.store'
import api from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const schema = z
  .object({
    displayName: z.string().min(1, 'Display name is required').max(100),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

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
        setError(
          err?.response?.data?.message ||
            err?.response?.data?.data?.message ||
            'Invalid or expired invitation link',
        )
      })
      .finally(() => setValidating(false))
  }, [token])

  const onSubmit = async (values: FormValues) => {
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
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.violations?.join('. ') ||
        'Failed to accept invitation'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (validating) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-500">Validating invitation...</p>
        </div>
      </div>
    )
  }

  if (error && !inviteEmail) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center justify-center h-12 w-12 bg-red-100 rounded-xl mx-auto mb-4">
            <AlertCircle className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Invalid Invitation
          </h2>
          <p className="text-sm text-gray-600 mb-6">{error}</p>
          <Link
            to="/login"
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center h-12 w-12 bg-blue-600 rounded-xl mb-3 shadow-md">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Join {orgName || 'Boardupscale'}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Set up your account for <strong>{inviteEmail}</strong>
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Display Name"
              placeholder="John Doe"
              error={errors.displayName?.message}
              {...register('displayName')}
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                error={errors.password?.message}
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

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
                className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {error && inviteEmail && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
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

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <Link
            to="/login"
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
