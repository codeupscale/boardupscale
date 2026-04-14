import { useState } from 'react'
import {
  CreditCard,
  Users,
  HardDrive,
  Brain,
  ExternalLink,
  ArrowUpRight,
  Check,
  Calendar,
  AlertCircle,
} from 'lucide-react'
import { useSubscription, useUsage, usePlans, useCheckout, useBillingPortal } from '@/hooks/useBilling'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { SettingsSkeleton } from '@/components/ui/skeleton'
import { toast } from '@/store/ui.store'

function UsageBar({
  label,
  icon: Icon,
  used,
  max,
  unit,
}: {
  label: string
  icon: React.ElementType
  used: number
  max: number
  unit: string
}) {
  const percentage = max <= 0 ? 0 : Math.min((used / max) * 100, 100)
  const isUnlimited = max < 0
  const isNearLimit = percentage >= 80

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isNearLimit
                ? 'bg-amber-50 dark:bg-amber-900/20'
                : 'bg-primary/10'
            }`}
          >
            <Icon
              className={`h-5 w-5 ${
                isNearLimit ? 'text-amber-500 dark:text-amber-400' : 'text-primary'
              }`}
            />
          </div>
          <span className="text-sm font-semibold text-foreground">{label}</span>
        </div>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {used} / {isUnlimited ? 'Unlimited' : `${max} ${unit}`}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isNearLimit
              ? 'bg-gradient-to-r from-amber-400 to-orange-500'
              : 'bg-gradient-to-r from-blue-500 to-indigo-500'
          }`}
          style={{ width: isUnlimited ? '5%' : `${percentage}%` }}
        />
      </div>
      {isNearLimit && !isUnlimited && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2.5 flex items-center gap-1.5 font-medium">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          Approaching limit. Consider upgrading your plan.
        </p>
      )}
    </div>
  )
}

function UpgradeCard({
  planSlug,
  onCheckout,
  isLoading,
}: {
  planSlug: string
  onCheckout: (slug: string, cycle: 'monthly' | 'yearly') => void
  isLoading: boolean
}) {
  const { data: plans } = usePlans()
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly')

  if (!plans) return null

  // Filter out current plan and only show active plans
  const upgradePlans = plans.filter((p) => p.slug !== planSlug && p.slug !== 'free')

  if (upgradePlans.length === 0) return null

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-bold text-foreground">Upgrade your plan</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Get more users, storage, and advanced features.
          </p>
        </div>
        <div className="inline-flex items-center gap-1 p-1 bg-muted rounded-lg flex-shrink-0">
          <button
            onClick={() => setCycle('monthly')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              cycle === 'monthly'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setCycle('yearly')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              cycle === 'yearly'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Yearly{' '}
            <span className="text-green-600 dark:text-green-400 font-semibold">−17%</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {upgradePlans.map((plan) => {
          const price = cycle === 'yearly' ? plan.priceYearly / 100 : plan.priceMonthly / 100
          const period = cycle === 'yearly' ? '/user/yr' : '/user/mo'
          const isPopular = plan.slug === 'pro'

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl p-5 transition-all hover:shadow-md ${
                isPopular
                  ? 'border-2 border-primary dark:border-primary bg-primary/5 dark:bg-primary/10 hover:border-primary'
                  : 'border border-border hover:border-primary/50 dark:hover:border-primary'
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-5">
                  <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                    Most Popular
                  </span>
                </div>
              )}
              <div className="mb-3">
                <h4 className="font-bold text-foreground text-base">{plan.name}</h4>
              </div>
              <p className="mb-1">
                <span className="text-3xl font-bold text-foreground">${price}</span>
                <span className="text-sm font-normal text-muted-foreground">{period}</span>
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                {plan.maxUsers < 0 ? 'Unlimited' : `Up to ${plan.maxUsers}`} users &middot; {plan.maxStorageGb} GB storage
              </p>
              <ul className="space-y-2 mb-5">
                {Object.entries(plan.features)
                  .filter(([, v]) => v)
                  .map(([key]) => (
                    <li key={key} className="flex items-center gap-2 text-xs text-foreground">
                      <div className="h-4 w-4 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                        <Check className="h-2.5 w-2.5 text-primary" />
                      </div>
                      {key === 'ai' && 'AI-powered features'}
                      {key === 'github' && 'GitHub integration'}
                      {key === 'saml' && 'SAML SSO'}
                    </li>
                  ))}
              </ul>
              <Button
                size="sm"
                className={`w-full ${isPopular ? 'bg-primary hover:bg-primary/90' : ''}`}
                variant={isPopular ? 'default' : 'outline'}
                isLoading={isLoading}
                onClick={() => onCheckout(plan.slug, cycle)}
              >
                Upgrade to {plan.name}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function BillingPage() {
  const { data: subscription, isLoading: subLoading } = useSubscription()
  const { data: usage, isLoading: usageLoading } = useUsage()
  const checkout = useCheckout()
  const portal = useBillingPortal()

  const handleCheckout = (planSlug: string, billingCycle: 'monthly' | 'yearly') => {
    checkout.mutate(
      { planSlug, billingCycle },
      {
        onSuccess: (data) => {
          window.open(data.url, '_blank')
        },
        onError: () => {
          toast('Failed to create checkout session', 'error')
        },
      },
    )
  }

  const handlePortal = () => {
    portal.mutate(undefined, {
      onSuccess: (data) => {
        window.open(data.url, '_blank')
      },
      onError: () => {
        toast('Failed to open billing portal', 'error')
      },
    })
  }

  const isLoading = subLoading || usageLoading

  if (isLoading) {
    return <SettingsSkeleton showNav={false} fields={3} />
  }

  const plan = subscription?.plan
  const planName = plan?.name || 'Free'
  const planSlug = plan?.slug || 'free'

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Billing & Subscription"
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Billing' }]}
        actions={
          subscription ? (
            <Button variant="outline" size="sm" onClick={handlePortal} isLoading={portal.isPending}>
              <ExternalLink className="h-3.5 w-3.5" />
              Manage Billing
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto p-6 bg-background">
        {/* Current plan hero — full-width gradient card */}
        <div className="relative rounded-2xl overflow-hidden mb-6 shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.12)_0%,transparent_60%)]" />
          <div className="relative px-8 py-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-14 w-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 flex-shrink-0">
                    <CreditCard className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <p className="text-blue-100 text-xs font-semibold uppercase tracking-widest mb-0.5">
                      Current Plan
                    </p>
                    <h2 className="text-3xl font-bold text-white">{planName}</h2>
                  </div>
                </div>
                {subscription ? (
                  <span
                    className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full border ${
                      subscription.status === 'active'
                        ? 'bg-white/20 text-white border-white/30'
                        : 'bg-amber-400/20 text-amber-100 border-amber-300/30'
                    }`}
                  >
                    {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                  </span>
                ) : (
                  <span className="inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full bg-white/20 text-white border border-white/30">
                    No active subscription
                  </span>
                )}
                {!subscription && (
                  <p className="mt-3 text-sm text-blue-100 max-w-md">
                    You are currently on the Free plan. Upgrade to unlock AI features, GitHub integration, and more.
                  </p>
                )}
              </div>
            </div>

            {subscription && plan && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-white/20">
                <div>
                  <p className="text-blue-200 text-xs font-medium mb-1">Monthly price</p>
                  <p className="text-white text-base font-bold">${plan.priceMonthly / 100}/user/mo</p>
                </div>
                <div>
                  <p className="text-blue-200 text-xs font-medium mb-1">Current period</p>
                  <div className="flex items-center gap-1.5 text-white text-base font-bold">
                    <Calendar className="h-4 w-4 text-blue-200 flex-shrink-0" />
                    <span className="text-sm font-semibold">
                      {new Date(subscription.currentPeriodStart).toLocaleDateString()} -{' '}
                      {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-blue-200 text-xs font-medium mb-1">Auto-renew</p>
                  <p className="text-white text-base font-bold">
                    {subscription.cancelAtPeriodEnd ? 'Cancels at period end' : 'Yes'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Usage section */}
        {usage && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Usage This Month</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <UsageBar
                label="Team members"
                icon={Users}
                used={usage.userCount}
                max={usage.maxUsers}
                unit="users"
              />
              <UsageBar
                label="Storage"
                icon={HardDrive}
                used={usage.storageUsedGb}
                max={usage.maxStorageGb}
                unit="GB"
              />
              <UsageBar
                label="AI tokens today"
                icon={Brain}
                used={usage.aiTokensToday}
                max={usage.aiTokensLimit}
                unit="tokens"
              />
            </div>
          </div>
        )}

        {/* Upgrade section */}
        {planSlug !== 'enterprise' && (
          <UpgradeCard
            planSlug={planSlug}
            onCheckout={handleCheckout}
            isLoading={checkout.isPending}
          />
        )}
      </div>
    </div>
  )
}
