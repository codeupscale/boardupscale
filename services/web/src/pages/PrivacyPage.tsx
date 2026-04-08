import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { SEO } from '@/components/seo/SEO'

const LAST_UPDATED = 'April 8, 2026'
const SUPPORT_EMAIL = 'support@autycloud.com'
const APP_URL = 'https://app.boardupscale.com'

const sections = [
  { id: 'overview',        label: 'Overview' },
  { id: 'data-collected',  label: 'Data We Collect' },
  { id: 'how-we-use',      label: 'How We Use Data' },
  { id: 'integrations',    label: 'Third-Party Integrations' },
  { id: 'storage',         label: 'Data Storage & Security' },
  { id: 'retention',       label: 'Data Retention' },
  { id: 'sharing',         label: 'Data Sharing' },
  { id: 'your-rights',     label: 'Your Rights' },
  { id: 'cookies',         label: 'Cookies' },
  { id: 'children',        label: 'Children\'s Privacy' },
  { id: 'changes',         label: 'Policy Changes' },
  { id: 'contact',         label: 'Contact Us' },
]

export function PrivacyPage() {
  return (
    <>
      <SEO title="Privacy Policy — Boardupscale" description="How Boardupscale collects, uses, and protects your data." />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        {/* Header */}
        <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link to="/" aria-label="Boardupscale home">
              <Logo size="sm" />
            </Link>
            <Link
              to="/login"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              Back to login
            </Link>
          </div>
        </header>

        {/* Body */}
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-12">

            {/* Sidebar TOC — sticky on desktop */}
            <aside className="hidden lg:block">
              <div className="sticky top-8">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Contents
                </p>
                <nav className="space-y-1">
                  {sections.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="block rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 transition-colors"
                    >
                      {s.label}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Main content */}
            <main className="min-w-0">
              {/* Title block */}
              <div className="mb-10">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
                  Privacy Policy
                </h1>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Last updated: {LAST_UPDATED}
                </p>
                <p className="mt-4 text-gray-600 dark:text-gray-300 leading-relaxed">
                  Boardupscale (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is a self-hosted project management
                  platform built by CodeUpscale. This Privacy Policy explains how we collect,
                  use, store, and protect information when you use{' '}
                  <a href={APP_URL} className="text-blue-600 hover:underline dark:text-blue-400">
                    {APP_URL}
                  </a>{' '}
                  and any related services (collectively, the &quot;Service&quot;).
                </p>
              </div>

              <div className="space-y-10 prose-headings:scroll-mt-6">

                {/* 1. Overview */}
                <Section id="overview" title="1. Overview">
                  <p>
                    Boardupscale is designed as a <strong>multi-tenant platform</strong>. Each
                    organisation&apos;s data is completely isolated from every other organisation —
                    every database query is scoped to your organisation and is never accessible
                    to other tenants. We do not sell your data, and we do not use your project
                    data to train AI models without your explicit consent.
                  </p>
                </Section>

                {/* 2. Data We Collect */}
                <Section id="data-collected" title="2. Data We Collect">
                  <SubHeading>Account &amp; Identity Data</SubHeading>
                  <ul>
                    <li>Name, email address, and avatar when you register or accept an invitation.</li>
                    <li>Password (stored as a bcrypt hash — we never store plain-text passwords).</li>
                    <li>OAuth profile data (name, email, profile picture) if you sign in via Google or GitHub.</li>
                    <li>Two-factor authentication state (TOTP seed stored encrypted).</li>
                  </ul>

                  <SubHeading>Organisation &amp; Project Data</SubHeading>
                  <ul>
                    <li>Organisation name, slug, logo, and settings.</li>
                    <li>Projects, boards, sprints, issues, epics, stories, tasks, subtasks, and comments you create.</li>
                    <li>File attachments you upload (stored in MinIO / S3).</li>
                    <li>Automation rules, webhooks, and API keys you configure.</li>
                    <li>Wiki pages and their revision history.</li>
                  </ul>

                  <SubHeading>Usage &amp; Technical Data</SubHeading>
                  <ul>
                    <li>IP address and browser/device user-agent for authentication security.</li>
                    <li>Timestamps of login events, issue changes, and other auditable actions.</li>
                    <li>Anonymous usage telemetry (a single ping on service startup — no PII, opt-out available via <code>TELEMETRY_ENABLED=false</code>).</li>
                  </ul>

                  <SubHeading>Imported Data</SubHeading>
                  <ul>
                    <li>
                      If you use the Jira Migration feature, we temporarily process data from your
                      Atlassian account (projects, issues, sprints, members) solely to import it
                      into your Boardupscale organisation. Atlassian OAuth tokens are stored
                      encrypted and are refreshed automatically.
                    </li>
                  </ul>
                </Section>

                {/* 3. How We Use Data */}
                <Section id="how-we-use" title="3. How We Use Your Data">
                  <p>We use the information we collect to:</p>
                  <ul>
                    <li>Provide, operate, and improve the Service.</li>
                    <li>Authenticate you and keep your account secure.</li>
                    <li>Send transactional emails (invitations, password resets, notifications).</li>
                    <li>Generate AI-powered features (issue summaries, duplicate detection) when enabled — your data is sent to OpenAI solely for inference and is not used for model training per OpenAI&apos;s API data usage policy.</li>
                    <li>Process payments and manage subscriptions via Stripe.</li>
                    <li>Maintain an immutable audit trail for compliance purposes.</li>
                    <li>Investigate and respond to security incidents.</li>
                  </ul>
                  <p>
                    We do <strong>not</strong> use your project data for advertising, profiling,
                    or any purpose outside of operating the Service.
                  </p>
                </Section>

                {/* 4. Third-Party Integrations */}
                <Section id="integrations" title="4. Third-Party Integrations">
                  <p>
                    The following third-party services may process your data when their respective
                    features are enabled:
                  </p>

                  <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 w-40">Provider</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Purpose</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 w-32">Privacy Policy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                        {[
                          {
                            name: 'Atlassian',
                            purpose: 'OAuth 2.0 sign-in and Jira project migration. Access tokens are encrypted at rest.',
                            url: 'https://www.atlassian.com/legal/privacy-policy',
                          },
                          {
                            name: 'GitHub',
                            purpose: 'OAuth sign-in, issue linking, pull request integration via GitHub App webhooks.',
                            url: 'https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement',
                          },
                          {
                            name: 'Google',
                            purpose: 'OAuth 2.0 sign-in. We receive your name, email, and profile picture.',
                            url: 'https://policies.google.com/privacy',
                          },
                          {
                            name: 'Stripe',
                            purpose: 'Payment processing and subscription management. Card details are never stored on our servers.',
                            url: 'https://stripe.com/privacy',
                          },
                          {
                            name: 'OpenAI',
                            purpose: 'AI-powered features (issue summaries, duplicate detection). Enabled only when AI_ENABLED=true.',
                            url: 'https://openai.com/policies/privacy-policy',
                          },
                        ].map((row) => (
                          <tr key={row.name}>
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{row.name}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.purpose}</td>
                            <td className="px-4 py-3">
                              <a
                                href={row.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline dark:text-blue-400"
                              >
                                View
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>

                {/* 5. Data Storage & Security */}
                <Section id="storage" title="5. Data Storage &amp; Security">
                  <ul>
                    <li><strong>Database:</strong> PostgreSQL 15 with all data scoped per organisation. Passwords are hashed with bcrypt. Sensitive credentials (API tokens, OAuth secrets) are encrypted with AES-256-GCM before storage.</li>
                    <li><strong>Cache &amp; sessions:</strong> Redis 7 — session data is short-lived (access tokens expire in 15 minutes; refresh tokens expire in 7 days and rotate on every use).</li>
                    <li><strong>Files:</strong> Stored in MinIO (self-hosted) or AWS S3 (cloud deployments). Access is via short-lived presigned URLs.</li>
                    <li><strong>Transport:</strong> All data in transit is encrypted with TLS 1.2+.</li>
                    <li><strong>Tenant isolation:</strong> Every database query includes an <code>organization_id</code> constraint. There is no cross-tenant data access path in the application layer.</li>
                  </ul>
                </Section>

                {/* 6. Data Retention */}
                <Section id="retention" title="6. Data Retention">
                  <ul>
                    <li><strong>Active data:</strong> Retained for as long as your organisation account is active.</li>
                    <li><strong>Soft deletes:</strong> Issues, projects, and other user content are soft-deleted (marked as deleted) and kept for 30 days before permanent removal, allowing recovery.</li>
                    <li><strong>Audit logs:</strong> Retained for a minimum of 2 years for compliance and security purposes.</li>
                    <li><strong>Account deletion:</strong> On organisation deletion, all associated data is permanently removed within 30 days, except where retention is required by law.</li>
                    <li><strong>Jira migration data:</strong> Temporary OAuth tokens used during migration are removed once the migration job completes or is cancelled.</li>
                  </ul>
                </Section>

                {/* 7. Data Sharing */}
                <Section id="sharing" title="7. Data Sharing &amp; Disclosure">
                  <p>We do <strong>not</strong> sell, rent, or trade your personal data. We may share data only in these limited circumstances:</p>
                  <ul>
                    <li><strong>Service providers:</strong> Third-party processors listed in Section 4, under contract and only for the purposes described.</li>
                    <li><strong>Legal compliance:</strong> If required by law, court order, or to protect the rights, property, or safety of Boardupscale, its users, or the public.</li>
                    <li><strong>Business transfer:</strong> In the event of a merger or acquisition, your data may be transferred with advance notice to affected users.</li>
                    <li><strong>With your consent:</strong> For any other purpose, only with your explicit consent.</li>
                  </ul>
                </Section>

                {/* 8. Your Rights */}
                <Section id="your-rights" title="8. Your Rights">
                  <p>Depending on your jurisdiction, you may have the following rights:</p>
                  <ul>
                    <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
                    <li><strong>Correction:</strong> Update inaccurate or incomplete information via your profile settings.</li>
                    <li><strong>Deletion:</strong> Request deletion of your account and associated personal data.</li>
                    <li><strong>Portability:</strong> Request an export of your organisation&apos;s data.</li>
                    <li><strong>Objection:</strong> Object to certain processing activities.</li>
                    <li><strong>Withdraw consent:</strong> Disconnect OAuth integrations at any time from Settings → Integrations.</li>
                  </ul>
                  <p>
                    To exercise any of these rights, contact us at{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline dark:text-blue-400">
                      {SUPPORT_EMAIL}
                    </a>
                    . We will respond within 30 days.
                  </p>
                </Section>

                {/* 9. Cookies */}
                <Section id="cookies" title="9. Cookies &amp; Local Storage">
                  <p>We use minimal browser storage:</p>
                  <ul>
                    <li><strong>localStorage:</strong> Auth tokens, theme preference, and UI state (e.g., sidebar collapse). No third-party tracking cookies.</li>
                    <li><strong>Session cookies:</strong> Used only for SAML SSO flows and expire at the end of the browser session.</li>
                    <li>We do <strong>not</strong> use advertising or analytics cookies.</li>
                  </ul>
                </Section>

                {/* 10. Children */}
                <Section id="children" title="10. Children's Privacy">
                  <p>
                    Boardupscale is a professional project management tool intended for users
                    aged 16 and above. We do not knowingly collect personal data from children
                    under 16. If you believe a child has provided us personal information, please
                    contact us at{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline dark:text-blue-400">
                      {SUPPORT_EMAIL}
                    </a>{' '}
                    and we will delete it promptly.
                  </p>
                </Section>

                {/* 11. Changes */}
                <Section id="changes" title="11. Changes to This Policy">
                  <p>
                    We may update this Privacy Policy from time to time. When we make material
                    changes, we will notify you via email (to the address on your account) and
                    update the &quot;Last updated&quot; date at the top of this page. Continued use of
                    the Service after changes take effect constitutes your acceptance of the
                    updated policy.
                  </p>
                </Section>

                {/* 12. Contact */}
                <Section id="contact" title="12. Contact Us">
                  <p>For privacy-related questions, data access requests, or to report a concern:</p>
                  <div className="mt-4 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 p-5">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">CodeUpscale — Boardupscale Team</p>
                    <p className="mt-1 text-gray-600 dark:text-gray-300">
                      Email:{' '}
                      <a
                        href={`mailto:${SUPPORT_EMAIL}`}
                        className="text-blue-600 hover:underline dark:text-blue-400 font-medium"
                      >
                        {SUPPORT_EMAIL}
                      </a>
                    </p>
                    <p className="mt-1 text-gray-600 dark:text-gray-300">
                      Platform:{' '}
                      <a href={APP_URL} className="text-blue-600 hover:underline dark:text-blue-400">
                        {APP_URL}
                      </a>
                    </p>
                  </div>
                </Section>

              </div>

              {/* Footer */}
              <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500 dark:text-gray-400">
                <p>© {new Date().getFullYear()} CodeUpscale. All rights reserved.</p>
                <Link
                  to="/login"
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
                >
                  Back to Boardupscale
                </Link>
              </div>
            </main>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Local layout helpers ──────────────────────────────────────────────────── */

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50 mb-4">{title}</h2>
      <div className="text-gray-600 dark:text-gray-300 leading-relaxed space-y-3 [&_ul]:mt-2 [&_ul]:space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:text-gray-800 [&_strong]:dark:text-gray-200 [&_code]:bg-gray-100 [&_code]:dark:bg-gray-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono">
        {children}
      </div>
    </section>
  )
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-4 mb-1 text-sm font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wide">
      {children}
    </h3>
  )
}
