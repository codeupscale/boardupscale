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

const cookies = [
  {
    name: 'access_token',
    type: 'Essential',
    duration: '15 minutes',
    purpose: 'JWT access token used to authenticate API requests. HttpOnly, Secure.',
  },
  {
    name: 'refresh_token',
    type: 'Essential',
    duration: '7 days',
    purpose: 'JWT refresh token used to obtain new access tokens without re-login. HttpOnly, Secure.',
  },
  {
    name: 'csrf_token',
    type: 'Essential',
    duration: 'Session',
    purpose: 'Cross-Site Request Forgery protection token.',
  },
  {
    name: 'theme',
    type: 'Preference',
    duration: '1 year',
    purpose: 'Stores your light/dark mode preference.',
  },
  {
    name: 'i18n_lang',
    type: 'Preference',
    duration: '1 year',
    purpose: 'Stores your selected interface language.',
  },
]

export function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="Cookie Policy"
        description="Boardupscale Cookie Policy — what cookies we use and why."
        canonical="/cookies"
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
            <Link to="/terms" className="text-gray-500 hover:text-gray-900 transition-colors">Terms</Link>
            <Link to="/login" className="text-gray-500 hover:text-gray-900 transition-colors">Sign In</Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Cookie Policy</h1>
          <p className="text-sm text-gray-400">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="prose-sm max-w-none">

          <Section title="1. What Are Cookies?">
            <p>
              Cookies are small text files placed on your device by a website when you visit it. They are
              widely used to make websites work, remember your preferences, and provide information to the
              site owner.
            </p>
          </Section>

          <Section title="2. How We Use Cookies">
            <p>
              Boardupscale uses only <strong className="text-gray-800">essential</strong> and{' '}
              <strong className="text-gray-800">preference</strong> cookies. We do not use tracking,
              analytics, or advertising cookies. We do not share cookie data with third-party advertisers.
            </p>
          </Section>

          <Section title="3. Cookies We Set">
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Name</th>
                    <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Type</th>
                    <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Duration</th>
                    <th className="text-left p-3 border border-gray-200 font-semibold text-gray-700">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {cookies.map((c, i) => (
                    <tr key={c.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="p-3 border border-gray-200 font-mono text-gray-800">{c.name}</td>
                      <td className="p-3 border border-gray-200">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            c.type === 'Essential'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {c.type}
                        </span>
                      </td>
                      <td className="p-3 border border-gray-200 text-gray-600">{c.duration}</td>
                      <td className="p-3 border border-gray-200 text-gray-600">{c.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="4. localStorage">
            <p>
              In addition to cookies, we use the browser's <code className="bg-gray-100 px-1 rounded text-xs font-mono">localStorage</code> to
              store non-sensitive preferences such as sidebar state, board column widths, and notification
              read status. This data never leaves your device.
            </p>
          </Section>

          <Section title="5. Third-Party Cookies">
            <p>
              We do not use third-party analytics services (e.g., Google Analytics) or advertising
              networks that set cookies. If you use OAuth sign-in (Google, GitHub), those providers may
              set their own cookies governed by their respective privacy policies.
            </p>
          </Section>

          <Section title="6. Managing Cookies">
            <p>
              Essential cookies are required for the Service to function. You can disable them in your
              browser settings, but doing so will prevent you from logging in.
            </p>
            <p>
              Preference cookies can be cleared at any time via your browser settings without affecting
              your ability to use the Service; your preferences will simply reset to defaults.
            </p>
            <p>
              Most browsers allow you to view, delete, and block cookies. See your browser's help documentation:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google Chrome</a></li>
              <li><a href="https://support.mozilla.org/en-US/kb/enhanced-tracking-protection-firefox-desktop" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Mozilla Firefox</a></li>
              <li><a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Apple Safari</a></li>
              <li><a href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Microsoft Edge</a></li>
            </ul>
          </Section>

          <Section title="7. Changes to This Policy">
            <p>
              We may update this Cookie Policy from time to time. Changes will be reflected by updating
              the "Last updated" date at the top of this page.
            </p>
          </Section>

          <Section title="8. Contact">
            <p>
              Questions about our use of cookies? Contact us at{' '}
              <a href="mailto:privacy@boardupscale.com" className="text-blue-600 hover:underline">
                privacy@boardupscale.com
              </a>.
            </p>
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
