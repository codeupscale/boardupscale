import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { HelpCircle, X, MessageSquare, BookOpen, Bug, Send, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { toast } from '@/store/ui.store'
import api from '@/lib/api'

interface ContactSupportPayload {
  subject: string
  message: string
  category?: string
}

function useContactSupport() {
  return useMutation({
    mutationFn: async (payload: ContactSupportPayload) => {
      const { data } = await api.post('/support/contact', payload)
      return data
    },
    onSuccess: () => {
      toast('Support request submitted. We will get back to you soon.')
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to send support request. Please try again.'
      toast(message, 'error')
    },
  })
}

export function HelpSupportPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const user = useAuthStore((s) => s.user)

  const { mutate: sendContact, isPending } = useContactSupport()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    sendContact(
      { subject, message },
      {
        onSuccess: () => {
          setSubject('')
          setMessage('')
          setIsOpen(false)
        },
      },
    )
  }

  function handleOpen() {
    setIsOpen(true)
  }

  function handleClose() {
    setIsOpen(false)
  }

  return (
    <>
      {/* Floating help button — positioned above the Upsy AI chat button */}
      <button
        onClick={handleOpen}
        aria-label="Open Help & Support"
        className={cn(
          'fixed z-50 flex items-center justify-center rounded-full transition-all duration-300',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
          'h-11 w-11 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
          'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
          'shadow-md hover:shadow-lg',
          // Position above the AI chat button (bottom-5 = 1.25rem, h-14 = 3.5rem, gap ~0.75rem → ~5.5rem from bottom)
          'bottom-[5.5rem] right-5',
        )}
      >
        <HelpCircle className="h-5 w-5" />
      </button>

      {/* Panel overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[49] bg-black/20 dark:bg-black/40"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* Help panel */}
      <div
        className={cn(
          'fixed z-50 bottom-[5.5rem] right-5 w-[360px] rounded-xl shadow-2xl',
          'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700',
          'flex flex-col transition-all duration-300 origin-bottom-right',
          isOpen
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-95 pointer-events-none',
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Help & Support"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-blue-500" />
            <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
              Help &amp; Support
            </span>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close Help & Support"
            className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick links */}
        <div className="px-4 pt-3 pb-2 flex gap-2">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex-1 justify-center',
              'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800',
              'hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700',
              'transition-colors cursor-not-allowed opacity-60',
            )}
            title="Documentation coming soon"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Documentation
          </a>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex-1 justify-center',
              'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800',
              'hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700',
              'transition-colors cursor-not-allowed opacity-60',
            )}
            title="Bug reporting coming soon"
          >
            <Bug className="h-3.5 w-3.5" />
            Report a Bug
          </a>
        </div>

        {/* Divider */}
        <div className="px-4 pb-1">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              Contact Support
            </span>
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>

        {/* Contact form */}
        <form onSubmit={handleSubmit} className="px-4 pb-4 pt-2 flex flex-col gap-3">
          {/* Pre-filled user info */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Name
              </label>
              <input
                type="text"
                value={user?.displayName ?? ''}
                readOnly
                className={cn(
                  'w-full rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs',
                  'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
                  'cursor-not-allowed',
                )}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Email
              </label>
              <input
                type="email"
                value={user?.email ?? ''}
                readOnly
                className={cn(
                  'w-full rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs',
                  'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
                  'cursor-not-allowed',
                )}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="support-subject"
              className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
            >
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              id="support-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              minLength={5}
              maxLength={200}
              placeholder="Brief description of your issue"
              className={cn(
                'w-full rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-xs',
                'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100',
                'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                'transition-colors',
              )}
            />
          </div>

          <div>
            <label
              htmlFor="support-message"
              className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
            >
              Message <span className="text-red-500">*</span>
            </label>
            <textarea
              id="support-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              minLength={10}
              maxLength={5000}
              rows={4}
              placeholder="Describe your issue in detail..."
              className={cn(
                'w-full rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-xs',
                'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100',
                'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                'resize-none transition-colors',
              )}
            />
          </div>

          <button
            type="submit"
            disabled={isPending || !subject.trim() || !message.trim()}
            className={cn(
              'flex items-center justify-center gap-2 w-full rounded-md px-3 py-2 text-xs font-semibold',
              'bg-blue-600 hover:bg-blue-700 text-white transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Send Message
              </>
            )}
          </button>
        </form>
      </div>
    </>
  )
}
