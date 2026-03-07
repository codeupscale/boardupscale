import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { Zap, ArrowLeft, Mail } from 'lucide-react'
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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true)
    setError(null)
    try {
      await api.post('/auth/forgot-password', { email: values.email })
      setIsSuccess(true)
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          'Something went wrong. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
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
          <p className="text-sm text-gray-500 mt-1">Reset your password</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          {isSuccess ? (
            <div className="text-center">
              <div className="flex items-center justify-center h-12 w-12 bg-green-100 rounded-full mx-auto mb-4">
                <Mail className="h-6 w-6 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Check your email
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                If an account with that email exists, we sent a password reset
                link. The link will expire in 1 hour.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-5">
                Enter the email address associated with your account and we will
                send you a link to reset your password.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  error={errors.email?.message}
                  {...register('email')}
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
                  Send reset link
                </Button>
              </form>
            </>
          )}
        </div>

        {/* Back to login */}
        {!isSuccess && (
          <p className="text-center text-sm text-gray-500 mt-4">
            <Link
              to="/login"
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
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
