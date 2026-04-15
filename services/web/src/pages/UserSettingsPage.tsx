import { UserRole } from '@/types'
import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldOff,
  Copy,
  RefreshCw,
  User,
  KeyRound,
  Building2,
  Crown,
  Shield,
  User2,
  Palette,
  Sun,
  Moon,
  Monitor,
  Check,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUpdateProfile, useChangePassword } from '@/hooks/useUsers'
import { useThemeStore, COLOR_THEMES, type ColorTheme } from '@/store/theme.store'
import { useMe, useSetup2FA, useConfirm2FA, useDisable2FA, useRegenerateBackupCodes } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Avatar } from '@/components/ui/avatar'
import { SettingsSkeleton } from '@/components/ui/skeleton'
import { SamlConfigForm } from '@/components/settings/saml-config-form'
import { PageHeader } from '@/components/common/page-header'
import { toast } from '@/store/ui.store'
import { cn } from '@/lib/utils'

// ─── Schemas ─────────────────────────────────────────────────────────────────

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

// ─── Role badge helper ────────────────────────────────────────────────────────

function getRoleBadge(role: string) {
  switch (role) {
    case 'owner':
      return {
        label: 'Owner',
        cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-700',
        Icon: Crown,
      }
    case 'admin':
      return {
        label: 'Admin',
        cls: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary border border-primary/30 dark:border-primary/40',
        Icon: Shield,
      }
    default:
      return {
        label: 'Member',
        cls: 'bg-muted text-foreground/80 border border-border',
        Icon: User2,
      }
  }
}

// ─── Content section wrapper ──────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6 pb-4 border-b border-border">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
    </div>
  )
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────

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
    control,
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

  if (isLoading) return <SettingsSkeleton showNav={false} fields={5} />

  const handleProfileSubmit = (data: ProfileValues) => {
    if (data.language && data.language !== i18n.language) {
      i18n.changeLanguage(data.language)
    }
    updateProfile.mutate(data)
  }

  return (
    <>
      <SectionHeader title="Profile" description="Update your avatar, display name, and regional preferences" />
      <form onSubmit={handleSubmit(handleProfileSubmit)} className="space-y-5 max-w-lg">
        {/* Avatar row */}
        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-xl border border-border">
          <Avatar src={avatarUrl || me?.avatarUrl} name={me?.displayName || 'User'} size="lg" />
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Avatar URL</p>
            <Input
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
          <Controller
            name="timezone"
            control={control}
            render={({ field }) => (
              <div className="w-full">
                <Label className="mb-1">{t('settings.timezone')}</Label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezoneOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />
          <Controller
            name="language"
            control={control}
            render={({ field }) => (
              <div className="w-full">
                <Label className="mb-1">{t('settings.language')}</Label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languageOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />
        </div>

        {/* Email (read-only) */}
        <div className="p-4 bg-muted/50 rounded-xl border border-border">
          <p className="text-xs font-medium text-muted-foreground mb-1">{t('settings.emailAddress')}</p>
          <p className="text-sm font-semibold text-foreground">{me?.email}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('settings.emailCannotChange')}</p>
        </div>

        <Button type="submit" isLoading={updateProfile.isPending} disabled={!isDirty}>
          {t('settings.saveChanges')}
        </Button>
      </form>
    </>
  )
}

// ─── Account Tab ─────────────────────────────────────────────────────────────

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
    <>
      <SectionHeader title="Account" description="Manage your password and account credentials" />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
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
            className="absolute right-3 top-[34px] text-muted-foreground hover:text-foreground dark:hover:text-foreground transition-colors"
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
            className="absolute right-3 top-[34px] text-muted-foreground hover:text-foreground dark:hover:text-foreground transition-colors"
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
            className="absolute right-3 top-[34px] text-muted-foreground hover:text-foreground dark:hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <div className="pt-1">
          <Button type="submit" isLoading={changePassword.isPending}>
            {t('settings.updatePassword')}
          </Button>
        </div>
      </form>
    </>
  )
}

// ─── Security Tab ─────────────────────────────────────────────────────────────

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
    setup2FA.mutate(undefined, { onSuccess: (data) => setSetupData(data) })
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
    <>
      <SectionHeader title="Security" description="Protect your account with two-factor authentication" />
      <div className="space-y-5 max-w-lg">
        {/* 2FA status card */}
        <div
          className={cn(
            'flex items-start gap-4 p-4 rounded-xl border',
            is2FAEnabled
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
              : 'bg-muted/50 border-border',
          )}
        >
          <div
            className={cn(
              'h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0',
              is2FAEnabled
                ? 'bg-green-100 dark:bg-green-900/40'
                : 'bg-muted',
            )}
          >
            {is2FAEnabled ? (
              <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <ShieldOff className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <p className={cn('text-sm font-semibold', is2FAEnabled ? 'text-green-700 dark:text-green-300' : 'text-foreground')}>
              {is2FAEnabled ? 'Two-factor authentication is enabled' : 'Two-factor authentication is disabled'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {is2FAEnabled
                ? 'Your account is protected. Use your authenticator app when signing in.'
                : 'Add an extra layer of security using a TOTP authenticator app.'}
            </p>
          </div>
        </div>

        {/* Enable button */}
        {!is2FAEnabled && !setupData && (
          <Button onClick={handleSetup} isLoading={setup2FA.isPending}>
            Enable Two-Factor Authentication
          </Button>
        )}

        {/* QR Code setup */}
        {setupData && (
          <div className="space-y-4 p-5 bg-card border border-border rounded-xl">
            <p className="text-sm font-semibold text-foreground">
              Scan this QR code with your authenticator app
            </p>
            <div className="flex justify-center p-4 bg-card rounded-lg border border-border">
              <img src={setupData.qrCodeUrl} alt="2FA QR Code" className="w-44 h-44" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Or enter this secret manually:</p>
              <code className="block text-xs bg-muted px-3 py-2.5 rounded-lg border border-border font-mono break-all select-all text-foreground">
                {setupData.secret}
              </code>
            </div>
            <div className="space-y-3">
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
          <div className="p-5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl space-y-3">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Save these backup codes in a safe place
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">Each code can only be used once.</p>
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <code
                  key={i}
                  className="text-sm bg-card px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-700 font-mono text-center text-foreground"
                >
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

        {/* Manage 2FA when enabled */}
        {is2FAEnabled && !setupData && !backupCodes && (
          <div className="space-y-3">
            {!showDisableConfirm && !showRegenConfirm && (
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowRegenConfirm(true)}>
                  <RefreshCw className="h-4 w-4 mr-1.5" /> Regenerate Backup Codes
                </Button>
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                  onClick={() => setShowDisableConfirm(true)}
                >
                  Disable 2FA
                </Button>
              </div>
            )}

            {showDisableConfirm && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl space-y-3">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">Confirm your password to disable 2FA</p>
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
              <div className="p-4 bg-muted border border-border rounded-xl space-y-3">
                <p className="text-sm font-semibold text-foreground">Confirm your password to regenerate backup codes</p>
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
    </>
  )
}

// ─── Appearance Tab ──────────────────────────────────────────────────────────

function AppearanceTab() {
  const { theme, setTheme, colorTheme, setColorTheme, resolved } = useThemeStore()

  const modeOptions: { id: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun; description: string }[] = [
    { id: 'light', label: 'Light', icon: Sun, description: 'Clean & bright' },
    { id: 'dark', label: 'Dark', icon: Moon, description: 'Easy on the eyes' },
    { id: 'system', label: 'System', icon: Monitor, description: 'Match your OS' },
  ]

  return (
    <>
      <SectionHeader title="Appearance" description="Customize the look and feel of your workspace" />
      <div className="space-y-8 max-w-2xl">
        {/* Mode selector */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Mode</h3>
          <div className="grid grid-cols-3 gap-3">
            {modeOptions.map(({ id, label, icon: Icon, description }) => (
              <button
                key={id}
                onClick={() => setTheme(id)}
                className={cn(
                  'relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer',
                  theme === id
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/30 hover:bg-accent/50',
                )}
              >
                {theme === id && (
                  <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
                <div className={cn(
                  'h-10 w-10 rounded-lg flex items-center justify-center',
                  theme === id ? 'bg-primary/10' : 'bg-muted',
                )}>
                  <Icon className={cn('h-5 w-5', theme === id ? 'text-primary' : 'text-muted-foreground')} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Color theme selector */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Light Theme</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {resolved === 'dark' ? 'Preview shows selected theme (visible in light mode)' : 'Active color scheme for light mode'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {COLOR_THEMES.map((t) => (
              <ThemeCard
                key={t.id}
                theme={t}
                isActive={colorTheme === t.id}
                onSelect={() => setColorTheme(t.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function ThemeCard({
  theme,
  isActive,
  onSelect,
}: {
  theme: (typeof COLOR_THEMES)[number]
  isActive: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'relative text-left rounded-xl border-2 overflow-hidden transition-all duration-200 cursor-pointer group',
        isActive
          ? 'border-primary shadow-md ring-1 ring-primary/20'
          : 'border-border hover:border-primary/30 hover:shadow-sm',
      )}
    >
      {isActive && (
        <div className="absolute top-2.5 right-2.5 z-10 h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow-sm">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      )}

      {/* Mini preview */}
      <div className="h-20 flex overflow-hidden">
        {/* Mini sidebar */}
        <div
          className="w-16 flex flex-col gap-1 p-2 border-r"
          style={{ background: `linear-gradient(175deg, ${theme.preview.primary}08, ${theme.preview.primary}12)`, borderColor: `${theme.preview.primary}20` }}
        >
          <div className="h-2 w-10 rounded-sm" style={{ background: `${theme.preview.primary}20` }} />
          <div className="h-4 rounded-sm" style={{ background: `linear-gradient(135deg, ${theme.preview.primary}, ${theme.preview.secondary})` }} />
          <div className="h-2 w-8 rounded-sm" style={{ background: `${theme.preview.primary}15` }} />
          <div className="h-2 w-9 rounded-sm" style={{ background: `${theme.preview.primary}15` }} />
        </div>
        {/* Mini main */}
        <div className="flex-1 p-2 flex flex-col gap-1" style={{ background: `${theme.preview.primary}05` }}>
          <div className="flex items-center justify-between">
            <div className="h-2 w-14 rounded-sm" style={{ background: `${theme.preview.primary}25` }} />
            <div className="h-3 w-10 rounded-sm" style={{ background: `linear-gradient(135deg, ${theme.preview.primary}, ${theme.preview.secondary})` }} />
          </div>
          <div className="flex gap-1 flex-1">
            <div className="flex-1 rounded-sm border p-1" style={{ borderColor: `${theme.preview.primary}18`, background: 'white' }}>
              <div className="h-1.5 w-full rounded-sm mb-1" style={{ background: `${theme.preview.primary}12` }} />
              <div className="flex gap-1">
                <div className="h-2 w-6 rounded-sm" style={{ background: `${theme.preview.secondary}20` }} />
                <div className="h-2 w-2 rounded-full" style={{ background: `${theme.preview.accent}` }} />
              </div>
            </div>
            <div className="flex-1 rounded-sm border p-1" style={{ borderColor: `${theme.preview.primary}18`, background: 'white' }}>
              <div className="h-1.5 w-full rounded-sm mb-1" style={{ background: `${theme.preview.primary}12` }} />
              <div className="flex gap-1">
                <div className="h-2 w-6 rounded-sm" style={{ background: `${theme.preview.secondary}20` }} />
                <div className="h-2 w-2 rounded-full" style={{ background: `${theme.preview.primary}` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Label */}
      <div className="px-3 py-2.5 border-t" style={{ borderColor: isActive ? undefined : `${theme.preview.primary}12` }}>
        <div className="flex items-center gap-2">
          {/* Color dots */}
          <div className="flex -space-x-1">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm" style={{ background: theme.preview.primary }} />
            <span className="h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm" style={{ background: theme.preview.secondary }} />
            <span className="h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm" style={{ background: theme.preview.accent }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{theme.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{theme.description}</p>
          </div>
        </div>
      </div>
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'profile', label: 'Profile', description: 'Avatar, name & preferences', icon: User },
  { id: 'account', label: 'Account', description: 'Password & credentials', icon: KeyRound },
  { id: 'appearance', label: 'Appearance', description: 'Themes & color schemes', icon: Palette },
  { id: 'security', label: 'Security', description: 'Two-factor authentication', icon: ShieldCheck },
]

export function UserSettingsPage() {
  const { t } = useTranslation()
  const { data: me, isLoading } = useMe()
  const [activeTab, setActiveTab] = useState('profile')

  const isOrgAdmin = me?.role === UserRole.ADMIN || me?.role === UserRole.OWNER

  const navItems = [
    ...NAV_ITEMS,
    ...(isOrgAdmin
      ? [{ id: 'sso', label: 'SSO / SAML', description: 'Enterprise authentication', icon: Building2 }]
      : []),
  ]

  if (isLoading) return <SettingsSkeleton />

  const roleBadge = getRoleBadge(me?.role || 'member')
  const RoleIcon = roleBadge.Icon

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Account Settings"
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Account' }]}
      />

      <div className="flex-1 overflow-auto min-h-0 bg-background">
        {/* Full-width gradient hero banner */}
        <div className="h-32 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, var(--plasma-stop-0), var(--plasma-stop-1) 50%, var(--plasma-stop-2))' }}>
          <div className="absolute inset-0 bg-black/5" />
          <div
            className="absolute inset-0"
            style={{ backgroundImage: 'radial-gradient(circle at 75% 50%, rgba(255,255,255,0.12) 0%, transparent 60%)' }}
          />
        </div>

        {/* Profile identity card — overlaps banner */}
        <div className="relative px-6 -mt-12 mb-5">
          <div className="bg-card rounded-2xl shadow-sm border border-border px-6 py-4 flex items-center gap-5">
            <div className="ring-4 ring-card rounded-2xl shadow-md flex-shrink-0">
              <Avatar
                src={me?.avatarUrl}
                name={me?.displayName || 'User'}
                size="lg"
                className="h-16 w-16 text-lg"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-bold text-foreground truncate">
                  {me?.displayName || 'User'}
                </h2>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
                    roleBadge.cls,
                  )}
                >
                  <RoleIcon className="h-3 w-3" />
                  {roleBadge.label}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">{me?.email}</p>
            </div>
            <div className="hidden sm:flex items-center gap-6 text-center">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {me?.timezone?.split('/')[1]?.replace('_', ' ') || me?.timezone || 'UTC'}
                </p>
                <p className="text-xs text-muted-foreground">Timezone</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <p className="text-sm font-semibold text-foreground uppercase">
                  {me?.language || 'EN'}
                </p>
                <p className="text-xs text-muted-foreground">Language</p>
              </div>
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="px-6 pb-6 flex gap-5 items-start">
          {/* Left sidebar nav */}
          <nav className="w-56 flex-shrink-0 space-y-1" aria-label="Settings navigation">
            {navItems.map(({ id, label, description, icon: Icon }) => {
              const active = activeTab === id
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150',
                    active
                      ? 'plasma-nav-active shadow-md'
                      : 'bg-card border border-border hover:border-primary/30 dark:hover:border-primary/30 hover:bg-primary/10 dark:hover:bg-primary/5',
                  )}
                >
                  <div
                    className={cn(
                      'h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                      active
                        ? 'bg-white/20'
                        : 'bg-muted',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        active ? '' : 'text-muted-foreground',
                      )}
                    />
                  </div>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        'text-sm font-medium truncate',
                        active ? '' : 'text-foreground',
                      )}
                    >
                      {label}
                    </p>
                    <p
                      className={cn(
                        'text-xs truncate',
                        active ? 'opacity-80' : 'text-muted-foreground',
                      )}
                    >
                      {description}
                    </p>
                  </div>
                </button>
              )
            })}
          </nav>

          {/* Right content card */}
          <div className="flex-1 min-w-0 bg-card rounded-2xl border border-border shadow-sm p-6">
            {activeTab === 'profile' && <ProfileTab />}
            {activeTab === 'account' && <AccountTab />}
            {activeTab === 'appearance' && <AppearanceTab />}
            {activeTab === 'security' && <SecurityTab />}
            {activeTab === 'sso' && isOrgAdmin && (
              <>
                <SectionHeader
                  title="SSO / SAML"
                  description="Configure enterprise single sign-on for your organization"
                />
                <SamlConfigForm />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
