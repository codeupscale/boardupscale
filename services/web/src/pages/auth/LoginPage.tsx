import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLogin } from '@/hooks/useAuth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { t } = useTranslation()
  const login = useLogin()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center h-12 w-12 bg-blue-600 rounded-xl mb-3 shadow-md">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ProjectFlow</h1>
          <p className="text-sm text-gray-500 mt-1">{t('auth.loginSubtitle')}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <form onSubmit={handleSubmit((values) => login.mutate(values))} className="space-y-4">
            <Input
              label={t('common.email')}
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label={t('common.password')}
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />

            {login.isError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm text-red-600">{t('auth.invalidCredentials')}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={login.isPending}
            >
              {t('auth.signIn')}
            </Button>
          </form>
        </div>

        {/* Register link */}
        <p className="text-center text-sm text-gray-500 mt-4">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="text-blue-600 hover:text-blue-700 font-medium">
            {t('auth.createOne')}
          </Link>
        </p>
      </div>
    </div>
  )
}
