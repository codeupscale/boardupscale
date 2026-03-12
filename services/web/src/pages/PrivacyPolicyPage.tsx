import { Link } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { SEO } from '@/components/seo/SEO'

const LAST_UPDATED = 'March 11, 2026'

interface SectionProps {
  title: string
  children: React.ReactNode
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3 text-gray-600 leading-relaxed text-sm">{children}</div>
    </section>
  )
}

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="Privacy Policy"
        description="Boardupscale Privacy Policy — how we collect, use, and protect your personal data."
        canonical="/privacy"
      />

      {/* Nav */}
      <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex items-center justify-center h-7 w-7 bg-blue-600 rounded-lg">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">Boardupscale</span>
          </Link>
          <div className="flex items-center gap-5 text-sm">
            <Link to="/terms" className="text-gray-500 hover:text-gray-900 transition-colors">Terms</Link>
            <Link to="/cookies" className="text-gray-500 hover:text-gray-900 transition-colors">Cookies</Link>
            <Link to="/login" className="text-gray-500 hover:text-gray-900 transition-colors">Sign In</Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Privacy Policy</h1>
          <p className="text-sm text-gray-400">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="prose-sm max-w-none">

          <Section title="1. Introduction">
            <p>
              Boardupscale ("we", "our", or "us") is an open-source project management platform operated by
              CodeUpscale. This Privacy Policy explains how we collect, use, store, and share information
              when you access or use boardupscale.com and any related services (collectively, the "Service").
            </p>
            <p>
              By using the Service, you agree to the collection and use of information in accordance with this
              policy. If you are self-hosting Boardupscale, this policy applies only to data processed by
              the hosted version at boardupscale.com. Your own self-hosted instance is outside our control
              and your organisation is the data controller for that data.
            </p>
          </Section>

          <Section title="2. Information We Collect">
            <p><strong className="text-gray-800">Account information.</strong> When you register, we collect your name, email address, and organisation name. You may optionally provide a profile photo.</p>
            <p><strong className="text-gray-800">Usage data.</strong> We automatically collect information about how you interact with the Service, including pages visited, features used, and actions taken (e.g., creating issues, moving cards).</p>
            <p><strong className="text-gray-800">Log data.</strong> Our servers automatically record standard log information such as your IP address, browser type, operating system, referrer URL, and timestamps.</p>
            <p><strong className="text-gray-800">Communications.</strong> If you contact us for support, we retain the content of those communications and your contact details.</p>
            <p><strong className="text-gray-800">OAuth data.</strong> If you sign in via Google, GitHub, or Microsoft, we receive your name, email, and profile photo from the respective provider. We do not store OAuth tokens beyond the session.</p>
          </Section>

          <Section title="3. How We Use Your Information">
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Provide, operate, and maintain the Service</li>
              <li>Create and manage your account</li>
              <li>Send transactional emails (email verification, password reset, notifications you configure)</li>
              <li>Respond to support requests</li>
              <li>Detect and prevent fraudulent or abusive activity</li>
              <li>Analyse usage patterns to improve the Service</li>
              <li>Comply with legal obligations</li>
            </ul>
            <p>We do <strong className="text-gray-800">not</strong> sell your personal data to third parties, nor do we use it for targeted advertising.</p>
          </Section>

          <Section title="4. Data Sharing">
            <p>We may share your information with:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong className="text-gray-800">Service providers.</strong> Trusted third parties that help us operate the Service (e.g., cloud hosting, email delivery, error tracking). These parties are contractually bound to protect your data and process it only on our behalf.</li>
              <li><strong className="text-gray-800">Your organisation.</strong> Administrators of your Boardupscale organisation can see member names, email addresses, and activity within that organisation.</li>
              <li><strong className="text-gray-800">Legal requirements.</strong> We may disclose information if required by law, court order, or government request, or to protect the rights and safety of our users or the public.</li>
              <li><strong className="text-gray-800">Business transfers.</strong> In the event of a merger, acquisition, or asset sale, your information may be transferred as part of that transaction. We will notify you before your data is transferred and becomes subject to a different privacy policy.</li>
            </ul>
          </Section>

          <Section title="5. Data Retention">
            <p>
              We retain your personal data for as long as your account is active or as needed to provide the
              Service. If you delete your account, we will delete or anonymise your personal data within
              30 days, except where we are required to retain it for legal or compliance reasons
              (e.g., billing records, audit logs required by law).
            </p>
            <p>
              Issue content, comments, and project data created by you may remain visible to other members
              of your organisation after you leave, as they form part of the project record.
            </p>
          </Section>

          <Section title="6. Security">
            <p>
              We implement industry-standard security measures including TLS encryption in transit, AES-256
              encryption at rest, bcrypt password hashing, JWT with short-lived access tokens (15 minutes),
              and role-based access controls.
            </p>
            <p>
              No method of transmission over the internet or method of electronic storage is 100% secure.
              While we strive to use commercially acceptable means to protect your data, we cannot guarantee
              absolute security.
            </p>
          </Section>

          <Section title="7. Cookies">
            <p>
              We use essential cookies for authentication sessions and CSRF protection. For details, see our{' '}
              <Link to="/cookies" className="text-blue-600 hover:underline">Cookie Policy</Link>.
            </p>
          </Section>

          <Section title="8. Your Rights">
            <p>Depending on your location, you may have the following rights under applicable data protection laws (including GDPR, CCPA):</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong className="text-gray-800">Access.</strong> Request a copy of the personal data we hold about you.</li>
              <li><strong className="text-gray-800">Correction.</strong> Request correction of inaccurate data.</li>
              <li><strong className="text-gray-800">Deletion.</strong> Request deletion of your personal data.</li>
              <li><strong className="text-gray-800">Portability.</strong> Request a machine-readable export of your data.</li>
              <li><strong className="text-gray-800">Objection.</strong> Object to or restrict certain processing activities.</li>
              <li><strong className="text-gray-800">Withdraw consent.</strong> Where processing is based on consent, you may withdraw it at any time.</li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:privacy@boardupscale.com" className="text-blue-600 hover:underline">
                privacy@boardupscale.com
              </a>. We will respond within 30 days.
            </p>
          </Section>

          <Section title="9. International Transfers">
            <p>
              Your information may be transferred to, and maintained on, servers located outside your
              jurisdiction where data protection laws may differ. By using the Service, you consent to such
              transfers. Where required, we use Standard Contractual Clauses approved by the European
              Commission to safeguard transfers from the EEA.
            </p>
          </Section>

          <Section title="10. Children's Privacy">
            <p>
              The Service is not directed to children under the age of 16. We do not knowingly collect
              personal data from children under 16. If we become aware that a child under 16 has provided
              us with personal information, we will delete it promptly.
            </p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any material changes
              by posting the new policy on this page and updating the "Last updated" date. For significant
              changes, we will also send an in-app notification or email.
            </p>
          </Section>

          <Section title="12. Contact Us">
            <p>
              If you have questions or concerns about this Privacy Policy, please contact us at:
            </p>
            <address className="not-italic bg-gray-50 rounded-lg border border-gray-200 p-4 text-sm mt-3">
              <strong className="text-gray-900 block mb-1">CodeUpscale / Boardupscale</strong>
              <a href="mailto:privacy@boardupscale.com" className="text-blue-600 hover:underline">
                privacy@boardupscale.com
              </a>
              <br />
              <a
                href="https://github.com/codeupscale/boardupscale/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                GitHub Issues
              </a>
            </address>
          </Section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} Boardupscale. All rights reserved.</p>
          <div className="flex items-center gap-5 text-xs text-gray-400">
            <Link to="/terms" className="hover:text-gray-700 transition-colors">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-gray-700 transition-colors">Privacy Policy</Link>
            <Link to="/cookies" className="hover:text-gray-700 transition-colors">Cookie Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
