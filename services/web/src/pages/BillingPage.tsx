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
import { Spinner } from '@/components/ui/spinner'
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
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Icon className="h-4 w-4 text-blue-600" />
          </div>
          <span className="text-sm font-medium text-gray-900">{label}</span>
        </div>
        <span className="text-sm text-gray-500">
          {used} / {isUnlimited ? 'Unlimited' : `${max} ${unit}`}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isNearLimit ? 'bg-orange-500' : 'bg-blue-500'
          }`}
          style={{ width: isUnlimited ? '5%' : `${percentage}%` }}
        />
      </div>
      {isNearLimit && !isUnlimited && (
        <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
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
    <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">Upgrade your plan</h3>
      <p className="text-sm text-gray-500 mb-6">Get more users, storage, and advanced features.</p>

      <div className="inline-flex items-center gap-2 p-1 bg-gray-100 rounded-lg mb-6">
        <button
          onClick={() => setCycle('monthly')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            cycle === 'monthly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setCycle('yearly')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            cycle === 'yearly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
          }`}
        >
          Yearly (save 17%)
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {upgradePlans.map((plan) => {
          const price = cycle === 'yearly' ? plan.priceYearly / 100 : plan.priceMonthly / 100
          const period = cycle === 'yearly' ? '/user/yr' : '/user/mo'

          return (
            <div
              key={plan.id}
              className="border border-gray-200 rounded-xl p-5 hover:border-blue-200 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-gray-900">{plan.name}</h4>
                {plan.slug === 'pro' && (
                  <span className="text-xs bg-blue-50 text-blue-700 font-medium px-2 py-0.5 rounded-full">
                    Popular
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-gray-900 mb-1">
                ${price}
                <span className="text-sm font-normal text-gray-500">{period}</span>
              </p>
              <p className="text-xs text-gray-500 mb-4">
                {plan.maxUsers < 0 ? 'Unlimited' : `Up to ${plan.maxUsers}`} users &middot; {plan.maxStorageGb} GB storage
              </p>
              <ul className="space-y-1.5 mb-4">
                {Object.entries(plan.features)
                  .filter(([, v]) => v)
                  .map(([key]) => (
                    <li key={key} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Check className="h-3 w-3 text-blue-600" />
                      {key === 'ai' && 'AI-powered features'}
                      {key === 'github' && 'GitHub integration'}
                      {key === 'saml' && 'SAML SSO'}
                    </li>
                  ))}
              </ul>
              <Button
                size="sm"
                className="w-full"
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
    return (
      <>
        <PageHeader title="Billing" breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Billing' }]} />
        <div className="flex items-center justify-center h-64">
          <Spinner className="h-8 w-8 text-blue-600" />
        </div>
      </>
    )
  }

  const plan = subscription?.plan
  const planName = plan?.name || 'Free'
  const planSlug = plan?.slug || 'free'

  return (
    <>
      <PageHeader
        title="Billing"
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Billing' }]}
      />
      <div className="p-6 max-w-4xl">
        {/* Current Plan Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {planName} Plan
                  </h2>
                  {subscription ? (
                    <span
                      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
                        subscription.status === 'active'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-yellow-50 text-yellow-700'
                      }`}
                    >
                      {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      No active subscription
                    </span>
                  )}
                </div>
              </div>
            </div>
            {subscription && (
              <Button variant="outline" size="sm" onClick={handlePortal} isLoading={portal.isPending}>
                <ExternalLink className="h-3.5 w-3.5" />
                Manage Billing
              </Button>
            )}
          </div>

          {subscription && plan && (
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Monthly price</p>
                <p className="text-sm font-semibold text-gray-900">${plan.priceMonthly / 100}/user/mo</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Current period</p>
                <div className="flex items-center gap-1 text-sm text-gray-900">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  {new Date(subscription.currentPeriodStart).toLocaleDateString()} - {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Auto-renew</p>
                <p className="text-sm font-semibold text-gray-900">
                  {subscription.cancelAtPeriodEnd ? 'Cancels at period end' : 'Yes'}
                </p>
              </div>
            </div>
          )}

          {!subscription && (
            <p className="mt-4 text-sm text-gray-500">
              You are currently on the Free plan. Upgrade to unlock AI features, GitHub integration, and more.
            </p>
          )}
        </div>

        {/* Usage Stats */}
        {usage && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Usage</h3>
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

        {/* Upgrade Section */}
        {planSlug !== 'enterprise' && (
          <UpgradeCard
            planSlug={planSlug}
            onCheckout={handleCheckout}
            isLoading={checkout.isPending}
          />
        )}
      </div>
    </>
  )
}
