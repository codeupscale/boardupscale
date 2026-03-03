import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-6xl font-bold text-blue-600">404</p>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">{t('errors.notFound')}</h1>
        <p className="mt-2 text-gray-500">{t('errors.notFoundDesc')}</p>
        <div className="mt-6">
          <Link to="/dashboard">
            <Button>{t('errors.goToDashboard')}</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
