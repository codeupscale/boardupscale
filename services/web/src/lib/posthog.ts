import posthog from 'posthog-js'

const posthogKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const posthogHost = import.meta.env.VITE_POSTHOG_HOST as string | undefined

/**
 * Initialize PostHog analytics.
 * Completely no-op if VITE_POSTHOG_KEY is not set.
 */
export function initPostHog(): void {
  if (!posthogKey) {
    return
  }

  posthog.init(posthogKey, {
    api_host: posthogHost || 'https://us.i.posthog.com',
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    // Respect Do Not Track browser setting
    respect_dnt: true,
  })
}

/**
 * Identify the current user after login/auth.
 * No-op if PostHog is not initialized.
 */
export function identifyUser(
  userId: string,
  properties?: Record<string, string | number | boolean>,
): void {
  if (!posthogKey) {
    return
  }
  posthog.identify(userId, properties)
}

/**
 * Reset PostHog identity on logout.
 * No-op if PostHog is not initialized.
 */
export function resetPostHog(): void {
  if (!posthogKey) {
    return
  }
  posthog.reset()
}

export { posthog }
