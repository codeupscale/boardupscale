import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Zap, Check, X, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import { SEO } from '@/components/seo/SEO'

const plans = [
  {
    name: 'Free',
    slug: 'free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: 'For individuals and small teams getting started',
    maxUsers: '5 users',
    storage: '1 GB',
    highlights: [
      'Up to 5 users',
      '1 GB storage',
      'Kanban & Scrum boards',
      'Basic reporting',
      'Email support',
    ],
    cta: 'Get Started Free',
    popular: false,
  },
  {
    name: 'Pro',
    slug: 'pro',
    monthlyPrice: 7,
    yearlyPrice: 70,
    description: 'For growing teams that need more power',
    maxUsers: '25 users',
    storage: '10 GB',
    highlights: [
      'Up to 25 users',
      '10 GB storage',
      'AI-powered features',
      'GitHub integration',
      'Advanced reporting',
      'Custom workflows',
      'Sprint analytics',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    slug: 'enterprise',
    monthlyPrice: 15,
    yearlyPrice: 150,
    description: 'For organizations that need full control',
    maxUsers: 'Unlimited',
    storage: '100 GB',
    highlights: [
      'Unlimited users',
      '100 GB storage',
      'All AI features',
      'SAML SSO',
      'Audit trails (2-year retention)',
      'Custom roles & permissions',
      'Webhook integrations',
      'Dedicated support & SLA',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
]

const featureComparison = [
  {
    category: 'Project Management',
    features: [
      { name: 'Kanban boards', free: true, pro: true, enterprise: true },
      { name: 'Scrum boards', free: true, pro: true, enterprise: true },
      { name: 'Sprint planning', free: true, pro: true, enterprise: true },
      { name: 'Issue linking', free: true, pro: true, enterprise: true },
      { name: 'Custom workflows', free: false, pro: true, enterprise: true },
      { name: 'Automation rules', free: false, pro: true, enterprise: true },
      { name: 'WIP limits', free: false, pro: true, enterprise: true },
      { name: 'Swimlanes', free: false, pro: true, enterprise: true },
    ],
  },
  {
    category: 'Reporting & Analytics',
    features: [
      { name: 'Burndown charts', free: true, pro: true, enterprise: true },
      { name: 'Velocity charts', free: true, pro: true, enterprise: true },
      { name: 'Cumulative flow', free: false, pro: true, enterprise: true },
      { name: 'Cycle time analytics', free: false, pro: true, enterprise: true },
      { name: 'Sprint reports', free: false, pro: true, enterprise: true },
      { name: 'Timesheet tracking', free: false, pro: true, enterprise: true },
      { name: 'Data export (CSV/JSON)', free: false, pro: true, enterprise: true },
    ],
  },
  {
    category: 'AI & Integrations',
    features: [
      { name: 'AI issue suggestions', free: false, pro: true, enterprise: true },
      { name: 'AI sprint predictions', free: false, pro: true, enterprise: true },
      { name: 'GitHub integration', free: false, pro: true, enterprise: true },
      { name: 'Webhook support', free: false, pro: true, enterprise: true },
      { name: 'REST API access', free: true, pro: true, enterprise: true },
    ],
  },
  {
    category: 'Security & Admin',
    features: [
      { name: 'Two-factor auth', free: true, pro: true, enterprise: true },
      { name: 'SAML SSO', free: false, pro: false, enterprise: true },
      { name: 'Custom roles', free: false, pro: false, enterprise: true },
      { name: 'Audit trail', free: false, pro: false, enterprise: true },
      { name: 'IP allowlisting', free: false, pro: false, enterprise: true },
    ],
  },
]

const faqs = [
  {
    q: 'Can I switch plans at any time?',
    a: 'Yes. You can upgrade or downgrade your plan at any time. When upgrading, you will be charged the prorated difference. When downgrading, the credit will be applied to your next billing cycle.',
  },
  {
    q: 'What happens when I hit my user limit?',
    a: 'You will not be able to invite new members until you upgrade your plan or remove existing users. All existing users will continue to have full access.',
  },
  {
    q: 'Is there a free trial for paid plans?',
    a: 'Yes. All paid plans come with a 14-day free trial. No credit card required. You can explore all features during the trial and decide which plan works best for your team.',
  },
  {
    q: 'How does billing work for yearly plans?',
    a: 'Yearly plans are billed once per year and offer approximately 17% savings compared to monthly billing. The total amount is charged upfront at the beginning of each billing cycle.',
  },
  {
    q: 'Can I self-host Boardupscale?',
    a: 'Yes. Boardupscale is designed to be self-hosted. You can run it on your own infrastructure using Docker Compose for development and Kubernetes for production deployments.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit cards (Visa, Mastercard, American Express) through our payment processor Stripe. Enterprise customers can also pay by invoice.',
  },
]

export function PricingPage() {
  const [isYearly, setIsYearly] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="Pricing"
        description="Boardupscale is free and open source. Start for free with unlimited projects, then scale up with Pro and Enterprise plans. No hidden fees, no per-seat surprises."
        canonical="/pricing"
      />
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 bg-blue-600 rounded-lg">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-xl text-gray-900 tracking-tight">Boardupscale</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Sign In
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center justify-center h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="pt-16 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight">
            Plans for every team size
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            Start free, then scale as your team grows. All plans include a 14-day free trial.
          </p>

          {/* Billing toggle */}
          <div className="mt-10 inline-flex items-center gap-3 p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                !isYearly ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
                isYearly ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Yearly
              <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
                Save 17%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan) => {
              const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice
              const period = isYearly ? '/user/yr' : '/user/mo'
              const displayPeriod = plan.slug === 'free' ? '' : period

              return (
                <div
                  key={plan.name}
                  className={`relative bg-white rounded-2xl border p-8 flex flex-col ${
                    plan.popular
                      ? 'border-blue-200 shadow-xl shadow-blue-100/50 ring-1 ring-blue-200 md:scale-105'
                      : 'border-gray-200'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full">
                      Most Popular
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="text-xl font-semibold text-gray-900">{plan.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                  </div>

                  <div className="mb-8">
                    <span className="text-5xl font-bold text-gray-900">${price}</span>
                    {displayPeriod && (
                      <span className="text-gray-500 text-sm ml-1">{displayPeriod}</span>
                    )}
                    {isYearly && plan.slug !== 'free' && (
                      <p className="text-xs text-gray-400 mt-1">
                        ${Math.round(price / 12)}/mo billed annually
                      </p>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.highlights.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-gray-600">
                        <Check className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Link
                    to={plan.name === 'Enterprise' ? '#' : '/register'}
                    className={`inline-flex items-center justify-center h-11 px-6 text-sm font-semibold rounded-lg transition-colors gap-2 ${
                      plan.popular
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    {plan.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
              Feature comparison
            </h2>
            <p className="mt-4 text-gray-600">
              A detailed breakdown of what each plan includes.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden max-w-4xl mx-auto">
            {/* Header row */}
            <div className="grid grid-cols-4 border-b border-gray-200 bg-gray-50">
              <div className="p-4" />
              <div className="p-4 text-center">
                <span className="text-sm font-semibold text-gray-900">Free</span>
              </div>
              <div className="p-4 text-center">
                <span className="text-sm font-semibold text-blue-600">Pro</span>
              </div>
              <div className="p-4 text-center">
                <span className="text-sm font-semibold text-gray-900">Enterprise</span>
              </div>
            </div>

            {featureComparison.map((category) => (
              <div key={category.category}>
                <div className="grid grid-cols-4 border-b border-gray-100 bg-gray-50/50">
                  <div className="p-4 col-span-4">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {category.category}
                    </span>
                  </div>
                </div>
                {category.features.map((feature) => (
                  <div
                    key={feature.name}
                    className="grid grid-cols-4 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="p-4">
                      <span className="text-sm text-gray-700">{feature.name}</span>
                    </div>
                    {[feature.free, feature.pro, feature.enterprise].map((included, i) => (
                      <div key={i} className="p-4 flex items-center justify-center">
                        {included ? (
                          <Check className="h-4 w-4 text-blue-600" />
                        ) : (
                          <X className="h-4 w-4 text-gray-300" />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
              Frequently asked questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index
              return (
                <div
                  key={index}
                  className="border border-gray-200 rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-900">{faq.q}</span>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-gray-500 flex-shrink-0 ml-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0 ml-4" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5">
                      <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-gradient-to-br from-blue-600 to-purple-700">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white tracking-tight">
            Ready to ship faster?
          </h2>
          <p className="mt-4 text-blue-100 text-lg">
            Join thousands of teams already using Boardupscale to build better software.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="inline-flex items-center justify-center h-12 px-8 text-base font-semibold text-blue-600 bg-white rounded-xl hover:bg-blue-50 transition-colors gap-2"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex items-center justify-center h-7 w-7 bg-blue-600 rounded-lg">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-gray-900">Boardupscale</span>
            </Link>
            <p className="text-sm text-gray-500">
              &copy; {new Date().getFullYear()} Boardupscale. Built with love for teams that ship.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
