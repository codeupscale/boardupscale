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

export function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="Terms of Service"
        description="Boardupscale Terms of Service — the rules governing your use of the platform."
        canonical="/terms"
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
            <Link to="/privacy" className="text-gray-500 hover:text-gray-900 transition-colors">Privacy</Link>
            <Link to="/cookies" className="text-gray-500 hover:text-gray-900 transition-colors">Cookies</Link>
            <Link to="/login" className="text-gray-500 hover:text-gray-900 transition-colors">Sign In</Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Terms of Service</h1>
          <p className="text-sm text-gray-400">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="prose-sm max-w-none">

          <Section title="1. Acceptance of Terms">
            <p>
              By accessing or using Boardupscale (the "Service") operated by CodeUpscale ("we", "our", "us"),
              you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms,
              please do not use the Service.
            </p>
            <p>
              If you are using the Service on behalf of an organisation, you represent that you have the
              authority to bind that organisation to these Terms, and "you" refers to that organisation.
            </p>
          </Section>

          <Section title="2. Description of Service">
            <p>
              Boardupscale is an open-source, web-based project management platform supporting Scrum,
              Kanban, and hybrid agile methodologies. It is available as a hosted service at
              boardupscale.com and as a self-hostable open-source application under the MIT License at{' '}
              <a
                href="https://github.com/codeupscale/boardupscale"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                github.com/codeupscale/boardupscale
              </a>.
            </p>
          </Section>

          <Section title="3. Accounts and Registration">
            <p>
              To use most features of the Service, you must create an account. You agree to provide
              accurate, current, and complete information during registration and to keep it up to date.
            </p>
            <p>
              You are responsible for maintaining the confidentiality of your credentials and for all
              activity that occurs under your account. Notify us immediately at{' '}
              <a href="mailto:security@boardupscale.com" className="text-blue-600 hover:underline">
                security@boardupscale.com
              </a>{' '}
              if you suspect unauthorised access.
            </p>
            <p>
              You must be at least 16 years old to create an account. We reserve the right to refuse
              registration or terminate accounts at our discretion.
            </p>
          </Section>

          <Section title="4. Acceptable Use">
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe the intellectual property or privacy rights of others</li>
              <li>Upload, transmit, or distribute malware, viruses, or other harmful code</li>
              <li>Conduct denial-of-service attacks or attempt to gain unauthorised access to other systems</li>
              <li>Harvest or scrape user data without consent</li>
              <li>Use the Service to send spam or unsolicited commercial messages</li>
              <li>Impersonate another person or organisation</li>
              <li>Engage in any activity that interferes with or disrupts the Service</li>
            </ul>
            <p>
              Violation of this section may result in immediate suspension or termination of your account
              without notice.
            </p>
          </Section>

          <Section title="5. Content and Intellectual Property">
            <p>
              <strong className="text-gray-800">Your content.</strong> You retain ownership of all content
              you create or upload to the Service ("User Content"). By submitting User Content, you grant us
              a worldwide, non-exclusive, royalty-free licence to host, store, process, display, and
              distribute your User Content solely as necessary to provide the Service.
            </p>
            <p>
              <strong className="text-gray-800">Our content.</strong> The Boardupscale name, logo, software,
              and all related content are the property of CodeUpscale. The source code is licensed under the
              MIT License. Nothing in these Terms grants you a right to use our trademarks or trade names
              except as required to identify the software in accordance with the MIT License.
            </p>
            <p>
              <strong className="text-gray-800">Feedback.</strong> Any feedback, suggestions, or ideas you
              provide about the Service may be used by us without restriction or compensation to you.
            </p>
          </Section>

          <Section title="6. Open-Source Licence">
            <p>
              The Boardupscale source code is released under the{' '}
              <strong className="text-gray-800">MIT License</strong>. This means you are free to use, copy,
              modify, merge, publish, distribute, sublicense, and/or sell copies of the software, subject to
              the conditions of that licence.
            </p>
            <p>
              Self-hosted instances are governed solely by the MIT License. These Terms of Service apply
              only to the hosted service at boardupscale.com.
            </p>
          </Section>

          <Section title="7. Payment and Subscriptions">
            <p>
              Certain features of the Service are available on paid plans ("Subscription"). All prices are
              listed in USD and are exclusive of taxes unless stated otherwise.
            </p>
            <p>
              Subscriptions are billed in advance on a monthly or annual basis. You authorise us to charge
              the payment method you provide. Failure to pay may result in suspension of paid features.
            </p>
            <p>
              You may cancel your Subscription at any time. Cancellation takes effect at the end of the
              current billing period; no pro-rata refunds are issued for unused time, except where required
              by applicable law.
            </p>
          </Section>

          <Section title="8. Disclaimer of Warranties">
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
              IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
              PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED,
              ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
            </p>
          </Section>

          <Section title="9. Limitation of Liability">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL CODEUPSCALE, ITS
              AFFILIATES, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
              CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR DATA, ARISING OUT OF OR IN
              CONNECTION WITH YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p>
              OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ANY CLAIMS ARISING UNDER THESE TERMS SHALL NOT
              EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM OR
              (B) USD $100.
            </p>
          </Section>

          <Section title="10. Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless CodeUpscale and its officers, directors,
              employees, and agents from and against any claims, liabilities, damages, losses, and expenses
              (including reasonable legal fees) arising out of or in any way connected with your access to
              or use of the Service, your User Content, or your violation of these Terms.
            </p>
          </Section>

          <Section title="11. Termination">
            <p>
              Either party may terminate these Terms at any time. We may suspend or terminate your access
              to the Service immediately, without prior notice, if you breach these Terms.
            </p>
            <p>
              Upon termination, your right to use the Service ceases immediately. You may request an export
              of your data within 30 days of termination. After that period, we may delete your data in
              accordance with our Privacy Policy.
            </p>
          </Section>

          <Section title="12. Governing Law">
            <p>
              These Terms are governed by and construed in accordance with the laws of England and Wales,
              without regard to conflict of law provisions. Any disputes arising under these Terms shall be
              subject to the exclusive jurisdiction of the courts of England and Wales.
            </p>
          </Section>

          <Section title="13. Changes to These Terms">
            <p>
              We reserve the right to modify these Terms at any time. We will provide at least 14 days'
              notice of material changes via email or in-app notification. Continued use of the Service
              after the effective date constitutes acceptance of the revised Terms.
            </p>
          </Section>

          <Section title="14. Contact">
            <p>For questions about these Terms, contact us at:</p>
            <address className="not-italic bg-gray-50 rounded-lg border border-gray-200 p-4 text-sm mt-3">
              <strong className="text-gray-900 block mb-1">CodeUpscale / Boardupscale</strong>
              <a href="mailto:legal@boardupscale.com" className="text-blue-600 hover:underline">
                legal@boardupscale.com
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
