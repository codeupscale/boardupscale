import { Link } from 'react-router-dom'
import {
  Zap,
  LayoutDashboard,
  Calendar,
  Workflow,
  Brain,
  Github,
  Shield,
  Check,
  ArrowRight,
} from 'lucide-react'

const features = [
  {
    icon: LayoutDashboard,
    title: 'Kanban & Scrum Boards',
    description: 'Flexible boards that adapt to your workflow',
  },
  {
    icon: Calendar,
    title: 'Sprint Planning',
    description: 'AI-powered sprint intelligence and predictions',
  },
  {
    icon: Workflow,
    title: 'Smart Automation',
    description: 'Automate repetitive tasks with powerful rules',
  },
  {
    icon: Brain,
    title: 'AI-Native',
    description: 'Built-in AI for smarter project management',
  },
  {
    icon: Github,
    title: 'GitHub Integration',
    description: 'Seamless dev workflow with PR and commit tracking',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'SAML SSO, RBAC, and audit trails',
  },
]

const plans = [
  {
    name: 'Free',
    price: 0,
    period: '/month',
    description: 'For individuals and small teams getting started',
    features: ['Up to 5 users', '1 GB storage', 'Kanban & Scrum boards', 'Basic reporting', 'Email support'],
    cta: 'Get Started Free',
    popular: false,
  },
  {
    name: 'Pro',
    price: 7,
    period: '/user/mo',
    description: 'For growing teams that need more power',
    features: [
      'Up to 25 users',
      '10 GB storage',
      'AI-powered features',
      'GitHub integration',
      'Advanced reporting',
      'Custom workflows',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 15,
    period: '/user/mo',
    description: 'For organizations that need full control',
    features: [
      'Unlimited users',
      '100 GB storage',
      'All AI features',
      'SAML SSO',
      'Audit trails',
      'Custom roles & permissions',
      'Dedicated support',
      'SLA guarantee',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
]

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 bg-blue-600 rounded-lg">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-xl text-gray-900 tracking-tight">Boardupscale</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Features
              </a>
              <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Pricing
              </a>
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
            <div className="md:hidden flex items-center gap-3">
              <Link to="/login" className="text-sm font-medium text-gray-600">
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

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 -z-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgb(229 231 235) 1px, transparent 0)',
              backgroundSize: '40px 40px',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white via-transparent to-white" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-sm font-medium mb-8">
            <Zap className="h-3.5 w-3.5" />
            Now with AI-powered sprint planning
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 tracking-tight leading-[1.1] max-w-4xl mx-auto">
            Project management that{' '}
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              works like you think
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            The modern, AI-powered Jira alternative. Built for teams that ship fast.
            Kanban, Scrum, and everything in between.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="inline-flex items-center justify-center h-12 px-8 text-base font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-600/25 transition-all hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-0.5 gap-2"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#pricing"
              className="inline-flex items-center justify-center h-12 px-8 text-base font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all gap-2"
            >
              See Pricing
            </a>
          </div>

          {/* Hero visual */}
          <div className="mt-16 relative max-w-5xl mx-auto">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-200/60 overflow-hidden">
              <div className="h-8 bg-gray-50 border-b border-gray-200 flex items-center gap-2 px-4">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-yellow-400" />
                <div className="h-3 w-3 rounded-full bg-green-400" />
                <span className="ml-3 text-xs text-gray-400 font-mono">boardupscale.com/board</span>
              </div>
              <div className="p-6 bg-gradient-to-br from-gray-50 to-white">
                <div className="grid grid-cols-4 gap-4">
                  {['To Do', 'In Progress', 'In Review', 'Done'].map((col, i) => (
                    <div key={col} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{col}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                          {[3, 2, 1, 4][i]}
                        </span>
                      </div>
                      {Array.from({ length: [3, 2, 1, 4][i] }).map((_, j) => (
                        <div
                          key={j}
                          className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm"
                        >
                          <div className="h-2 w-3/4 bg-gray-200 rounded mb-2" />
                          <div className="h-2 w-1/2 bg-gray-100 rounded" />
                          <div className="flex items-center gap-2 mt-3">
                            <div
                              className={`h-1.5 w-8 rounded-full ${
                                ['bg-red-300', 'bg-yellow-300', 'bg-blue-300', 'bg-green-300'][
                                  (i + j) % 4
                                ]
                              }`}
                            />
                            <div className="h-5 w-5 rounded-full bg-gray-200 ml-auto" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Everything your team needs to ship
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              From planning to deployment, Boardupscale gives your team the tools to move fast without
              breaking things.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-50 transition-all duration-300"
              >
                <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                  <Icon className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section id="pricing" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Start free and scale as you grow. No hidden fees, no surprises.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative bg-white rounded-2xl border p-8 flex flex-col ${
                  plan.popular
                    ? 'border-blue-200 shadow-xl shadow-blue-100/50 ring-1 ring-blue-200'
                    : 'border-gray-200'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full">
                    Most Popular
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-gray-900">
                    ${plan.price}
                  </span>
                  <span className="text-gray-500 text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  to={plan.name === 'Enterprise' ? '/pricing' : '/register'}
                  className={`inline-flex items-center justify-center h-11 px-6 text-sm font-semibold rounded-lg transition-colors ${
                    plan.popular
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link
              to="/pricing"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors inline-flex items-center gap-1"
            >
              View full pricing comparison
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-7 w-7 bg-blue-600 rounded-lg">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-gray-900">Boardupscale</span>
            </div>

            <div className="flex items-center gap-6">
              <Link to="/pricing" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Pricing
              </Link>
              <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Features
              </a>
              <span className="text-sm text-gray-600">Documentation</span>
            </div>

            <p className="text-sm text-gray-500">
              &copy; {new Date().getFullYear()} Boardupscale. Built with love for teams that ship.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
