import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '@/store/auth.store'
import { useMe, useUpdateProfile, useChangePassword } from '@/hooks/useUsers'
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

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
]

function ProfileTab() {
  const { data: me, isLoading } = useMe()
  const updateProfile = useUpdateProfile()

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

  return (
    <form onSubmit={handleSubmit((data) => updateProfile.mutate(data))} className="space-y-6 max-w-lg">
      <div className="flex items-center gap-4">
        <Avatar src={avatarUrl || me?.avatarUrl} name={me?.displayName || 'User'} size="lg" />
        <div className="flex-1">
          <Input
            label="Avatar URL"
            placeholder="https://example.com/avatar.jpg"
            error={errors.avatarUrl?.message}
            {...register('avatarUrl')}
          />
        </div>
      </div>

      <Input
        label="Display Name"
        placeholder="Your name"
        error={errors.displayName?.message}
        {...register('displayName')}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Timezone"
          options={timezoneOptions}
          {...register('timezone')}
        />
        <Select
          label="Language"
          options={languageOptions}
          {...register('language')}
        />
      </div>

      <div>
        <p className="text-sm text-gray-500 mb-2">Email address</p>
        <p className="text-sm font-medium text-gray-900">{me?.email}</p>
        <p className="text-xs text-gray-400 mt-1">Email cannot be changed here</p>
      </div>

      <Button type="submit" isLoading={updateProfile.isPending} disabled={!isDirty}>
        Save Changes
      </Button>
    </form>
  )
}

function AccountTab() {
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
      <h3 className="font-semibold text-gray-900">Change Password</h3>

      <Input
        label="Current Password"
        type="password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <Input
        label="New Password"
        type="password"
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <Input
        label="Confirm New Password"
        type="password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      <Button type="submit" isLoading={changePassword.isPending}>
        Update Password
      </Button>
    </form>
  )
}

const TABS = ['Profile', 'Account']

export function UserSettingsPage() {
  const [activeTab, setActiveTab] = useState('Profile')

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader title="Settings" />

      <div className="mt-6">
        <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
        <div className="mt-6">
          {activeTab === 'Profile' && <ProfileTab />}
          {activeTab === 'Account' && <AccountTab />}
        </div>
      </div>
    </div>
  )
}
