import { UserRole } from '@/types'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, ShieldCheck, ShieldOff, Copy, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth.store'
import { useUpdateProfile, useChangePassword } from '@/hooks/useUsers'
import { useMe, useSetup2FA, useConfirm2FA, useDisable2FA, useRegenerateBackupCodes } from '@/hooks/useAuth'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Avatar } from '@/components/ui/avatar'
import { Tabs } from '@/components/ui/tabs'
import { LoadingPage } from '@/components/ui/spinner'
import { SamlConfigForm } from '@/components/settings/saml-config-form'
import { toast } from '@/store/ui.store'

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
        <p className="text-xs text-gray-500 mt-1">{t('settings.emailCannotChange')}</p>
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
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

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

      <div className="relative">
        <Input
          label={t('settings.currentPassword')}
          type={showCurrentPassword ? 'text' : 'password'}
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />
        <button
          type="button"
          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
          className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 transition-colors"
          tabIndex={-1}
        >
          {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <div className="relative">
        <Input
          label={t('settings.newPassword')}
          type={showNewPassword ? 'text' : 'password'}
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
        <button
          type="button"
          onClick={() => setShowNewPassword(!showNewPassword)}
          className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 transition-colors"
          tabIndex={-1}
        >
          {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <div className="relative">
        <Input
          label={t('settings.confirmNewPassword')}
          type={showConfirmPassword ? 'text' : 'password'}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <button
          type="button"
          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
          className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 transition-colors"
          tabIndex={-1}
        >
          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      <Button type="submit" isLoading={changePassword.isPending}>
        {t('settings.updatePassword')}
      </Button>
    </form>
  )
}

function SecurityTab() {
  const { data: me } = useMe()
  const setup2FA = useSetup2FA()
  const confirm2FA = useConfirm2FA()
  const disable2FA = useDisable2FA()
  const regenCodes = useRegenerateBackupCodes()

  const [setupData, setSetupData] = useState<{ secret: string; qrCodeUrl: string } | null>(null)
  const [confirmCode, setConfirmCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [disablePassword, setDisablePassword] = useState('')
  const [showDisableConfirm, setShowDisableConfirm] = useState(false)
  const [regenPassword, setRegenPassword] = useState('')
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)

  const is2FAEnabled = me?.twoFaEnabled ?? false

  const handleSetup = () => {
    setup2FA.mutate(undefined, {
      onSuccess: (data) => setSetupData(data),
    })
  }

  const handleConfirm = () => {
    confirm2FA.mutate(confirmCode, {
      onSuccess: (data) => {
        setSetupData(null)
        setConfirmCode('')
        setBackupCodes(data.backupCodes)
      },
    })
  }

  const handleDisable = () => {
    disable2FA.mutate(disablePassword, {
      onSuccess: () => {
        setShowDisableConfirm(false)
        setDisablePassword('')
      },
    })
  }

  const handleRegenCodes = () => {
    regenCodes.mutate(regenPassword, {
      onSuccess: (data) => {
        setShowRegenConfirm(false)
        setRegenPassword('')
        setBackupCodes(data.backupCodes)
      },
    })
  }

  const copyBackupCodes = () => {
    if (backupCodes) {
      navigator.clipboard.writeText(backupCodes.join('\n'))
      toast('Backup codes copied to clipboard')
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h3 className="font-semibold text-gray-900">Two-Factor Authentication</h3>
        <p className="text-sm text-gray-500 mt-1">
          Add an extra layer of security to your account using a TOTP authenticator app.
        </p>
      </div>

      {/* Status */}
      <div className={`flex items-center gap-3 p-4 rounded-lg border ${is2FAEnabled ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
        {is2FAEnabled ? (
          <ShieldCheck className="h-5 w-5 text-green-600" />
        ) : (
          <ShieldOff className="h-5 w-5 text-gray-400" />
        )}
        <div>
          <p className={`text-sm font-medium ${is2FAEnabled ? 'text-green-700' : 'text-gray-700'}`}>
            {is2FAEnabled ? '2FA is enabled' : '2FA is not enabled'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {is2FAEnabled
              ? 'Your account is protected with two-factor authentication.'
              : 'Enable 2FA to add an extra layer of security.'}
          </p>
        </div>
      </div>

      {/* Setup flow */}
      {!is2FAEnabled && !setupData && (
        <Button onClick={handleSetup} isLoading={setup2FA.isPending}>
          Enable Two-Factor Authentication
        </Button>
      )}

      {/* QR Code step */}
      {setupData && (
        <div className="space-y-4 p-4 bg-white border border-gray-200 rounded-lg">
          <p className="text-sm font-medium text-gray-900">
            Scan this QR code with your authenticator app:
          </p>
          <div className="flex justify-center">
            <img src={setupData.qrCodeUrl} alt="2FA QR Code" className="w-48 h-48" />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Or enter this secret manually:</p>
            <code className="block text-xs bg-gray-100 px-3 py-2 rounded font-mono break-all select-all">
              {setupData.secret}
            </code>
          </div>
          <div className="space-y-2">
            <Input
              label="Verification Code"
              placeholder="Enter 6-digit code"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            />
            <div className="flex gap-2">
              <Button onClick={handleConfirm} isLoading={confirm2FA.isPending} disabled={!confirmCode}>
                Verify & Enable
              </Button>
              <Button variant="outline" onClick={() => { setSetupData(null); setConfirmCode('') }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Backup codes display */}
      {backupCodes && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
          <p className="text-sm font-medium text-amber-800">
            Save these backup codes in a safe place. Each code can only be used once.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {backupCodes.map((code, i) => (
              <code key={i} className="text-sm bg-white px-3 py-1.5 rounded border border-amber-200 font-mono text-center">
                {code}
              </code>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyBackupCodes}>
              <Copy className="h-4 w-4 mr-1" /> Copy All
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBackupCodes(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {/* Disable / Regenerate (when enabled) */}
      {is2FAEnabled && !setupData && !backupCodes && (
        <div className="space-y-3">
          {!showDisableConfirm && !showRegenConfirm && (
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowRegenConfirm(true)}>
                <RefreshCw className="h-4 w-4 mr-1" /> Regenerate Backup Codes
              </Button>
              <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setShowDisableConfirm(true)}>
                Disable 2FA
              </Button>
            </div>
          )}

          {showDisableConfirm && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-3">
              <p className="text-sm text-red-700 font-medium">Enter your password to disable 2FA:</p>
              <Input
                type="password"
                placeholder="Your password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDisable()}
              />
              <div className="flex gap-2">
                <Button
                  className="bg-red-600 hover:bg-red-700"
                  onClick={handleDisable}
                  isLoading={disable2FA.isPending}
                  disabled={!disablePassword}
                >
                  Confirm Disable
                </Button>
                <Button variant="outline" onClick={() => { setShowDisableConfirm(false); setDisablePassword('') }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {showRegenConfirm && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
              <p className="text-sm text-gray-700 font-medium">Enter your password to regenerate backup codes:</p>
              <Input
                type="password"
                placeholder="Your password"
                value={regenPassword}
                onChange={(e) => setRegenPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRegenCodes()}
              />
              <div className="flex gap-2">
                <Button onClick={handleRegenCodes} isLoading={regenCodes.isPending} disabled={!regenPassword}>
                  Regenerate
                </Button>
                <Button variant="outline" onClick={() => { setShowRegenConfirm(false); setRegenPassword('') }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function UserSettingsPage() {
  const { t } = useTranslation()
  const { data: me } = useMe()
  const [activeTab, setActiveTab] = useState('profile')

  const isOrgAdmin = me?.role === UserRole.ADMIN

  const TABS = [
    { id: 'profile', label: t('settings.profile') },
    { id: 'account', label: t('settings.account') },
    { id: 'security', label: 'Security' },
    ...(isOrgAdmin ? [{ id: 'sso', label: 'SSO' }] : []),
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader title={t('settings.title')} />

      <div className="mt-6">
        <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
        <div className="mt-6">
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'account' && <AccountTab />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'sso' && isOrgAdmin && <SamlConfigForm />}
        </div>
      </div>
    </div>
  )
}
