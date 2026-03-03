import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth.store'
import { useUpdateProfile, useChangePassword } from '@/hooks/useUsers'
import { useMe } from '@/hooks/useAuth'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Avatar } from '@/components/ui/avatar'
import { Tabs } from '@/components/ui/tabs'
import { LoadingPage } from '@/components/ui/spinner'

const profileSchema = z.object({
  displayName: z.string().min(1, 'Display name is required'),
  avatarUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  timezone: z.string(),
  language: z.string(),
})

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type ProfileValues = z.infer<typeof profileSchema>
type PasswordValues = z.infer<typeof passwordSchema>

const timezoneOptions = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Karachi',
  'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
].map((tz) => ({ value: tz, label: tz }))

function ProfileTab() {
  const { t, i18n } = useTranslation()
  const { data: me, isLoading } = useMe()
  const updateProfile = useUpdateProfile()

  const languageOptions = [
    { value: 'en', label: t('languages.en') },
    { value: 'es', label: t('languages.es') },
    { value: 'fr', label: t('languages.fr') },
    { value: 'de', label: t('languages.de') },
    { value: 'ja', label: t('languages.ja') },
  ]

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      displayName: me?.displayName || '',
      avatarUrl: me?.avatarUrl || '',
      timezone: me?.timezone || 'UTC',
      language: me?.language || 'en',
    },
  })

  const avatarUrl = watch('avatarUrl')

  if (isLoading) return <LoadingPage />

  const handleProfileSubmit = (data: ProfileValues) => {
    // Change i18n language when user saves profile
    if (data.language && data.language !== i18n.language) {
      i18n.changeLanguage(data.language)
    }
    updateProfile.mutate(data)
  }

  return (
    <form onSubmit={handleSubmit(handleProfileSubmit)} className="space-y-6 max-w-lg">
      <div className="flex items-center gap-4">
        <Avatar src={avatarUrl || me?.avatarUrl} name={me?.displayName || 'User'} size="lg" />
        <div className="flex-1">
          <Input
            label={t('settings.avatarUrl')}
            placeholder="https://example.com/avatar.jpg"
            error={errors.avatarUrl?.message}
            {...register('avatarUrl')}
          />
        </div>
      </div>

      <Input
        label={t('auth.displayName')}
        placeholder="Your name"
        error={errors.displayName?.message}
        {...register('displayName')}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label={t('settings.timezone')}
          options={timezoneOptions}
          {...register('timezone')}
        />
        <Select
          label={t('settings.language')}
          options={languageOptions}
          {...register('language')}
        />
      </div>

      <div>
        <p className="text-sm text-gray-500 mb-2">{t('settings.emailAddress')}</p>
        <p className="text-sm font-medium text-gray-900">{me?.email}</p>
        <p className="text-xs text-gray-400 mt-1">{t('settings.emailCannotChange')}</p>
      </div>

      <Button type="submit" isLoading={updateProfile.isPending} disabled={!isDirty}>
        {t('settings.saveChanges')}
      </Button>
    </form>
  )
}

function AccountTab() {
  const { t } = useTranslation()
  const changePassword = useChangePassword()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
  })

  const onSubmit = (data: PasswordValues) => {
    changePassword.mutate(
      { currentPassword: data.currentPassword, newPassword: data.newPassword },
      { onSuccess: () => reset() },
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
      <h3 className="font-semibold text-gray-900">{t('settings.changePassword')}</h3>

      <Input
        label={t('settings.currentPassword')}
        type="password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <Input
        label={t('settings.newPassword')}
        type="password"
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <Input
        label={t('settings.confirmNewPassword')}
        type="password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      <Button type="submit" isLoading={changePassword.isPending}>
        {t('settings.updatePassword')}
      </Button>
    </form>
  )
}

export function UserSettingsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('profile')

  const TABS = [
    { id: 'profile', label: t('settings.profile') },
    { id: 'account', label: t('settings.account') },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader title={t('settings.title')} />

      <div className="mt-6">
        <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
        <div className="mt-6">
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'account' && <AccountTab />}
        </div>
      </div>
    </div>
  )
}
