import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useSearchParams } from 'react-router-dom'
import { Zap, ArrowLeft, CheckCircle } from 'lucide-react'
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
        'Must contain at least 1 special character'
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
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
      await api.post('/auth/reset-password', {
        token,
        newPassword: values.newPassword,
      })
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

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center justify-center h-12 w-12 bg-blue-600 rounded-xl mb-3 shadow-md">
              <Zap className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">ProjectFlow</h1>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center">
            <p className="text-sm text-red-600 mb-4">
              Invalid or missing reset token. Please request a new password
              reset link.
            </p>
            <Link
              to="/forgot-password"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Request new link
            </Link>
          </div>
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
          <h1 className="text-2xl font-bold text-gray-900">ProjectFlow</h1>
          <p className="text-sm text-gray-500 mt-1">Set your new password</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          {isSuccess ? (
            <div className="text-center">
              <div className="flex items-center justify-center h-12 w-12 bg-green-100 rounded-full mx-auto mb-4">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Password reset successful
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                Your password has been updated. You can now log in with your new
                password.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                <ArrowLeft className="h-4 w-4" />
                Go to login
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-5">
                Your new password must be at least 8 characters and contain
                uppercase, lowercase, number, and special character.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  label="New Password"
                  type="password"
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  error={errors.newPassword?.message}
                  {...register('newPassword')}
                />

                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  error={errors.confirmPassword?.message}
                  {...register('confirmPassword')}
                />

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  isLoading={isSubmitting}
                >
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
