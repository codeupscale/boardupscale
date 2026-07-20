/**
 * Coordinates toast/sound alerts across same-origin Boardupscale tabs.
 *
 * Every tab still updates its inbox/badge from the socket event.
 * Only one tab wins the alert claim so the user gets one toast+sound when
 * multiple Boardupscale tabs are open in the same browser profile.
 *
 * Uses localStorage for a synchronous cross-tab lock (BroadcastChannel alone
 * races when sockets deliver to all tabs at once).
 */

const STORAGE_PREFIX = 'boardupscale:notif-alert:'
const CLAIM_TTL_MS = 10_000
const CHANNEL_NAME = 'boardupscale:notification-alerts'

type ClaimMessage = {
  type: 'claim'
  notificationId: string
  tabId: string
}

const tabId =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`

const localClaims = new Set<string>()
let channel: BroadcastChannel | null = null

function storageKey(notificationId: string) {
  return `${STORAGE_PREFIX}${notificationId}`
}

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null
  }
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (event: MessageEvent<ClaimMessage>) => {
      const msg = event.data
      if (!msg || msg.type !== 'claim' || !msg.notificationId) return
      if (msg.tabId === tabId) return
      localClaims.add(msg.notificationId)
    }
  }
  return channel
}

/**
 * Returns true if this tab should play toast/sound for the notification.
 */
export function claimNotificationAlert(notificationId: string): boolean {
  if (!notificationId) return true
  if (typeof window === 'undefined') return true

  if (localClaims.has(notificationId)) return false

  const key = storageKey(notificationId)
  const now = Date.now()

  try {
    const raw = window.localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as { tabId?: string; at?: number }
      if (
        parsed?.tabId &&
        typeof parsed.at === 'number' &&
        now - parsed.at < CLAIM_TTL_MS
      ) {
        localClaims.add(notificationId)
        return parsed.tabId === tabId
      }
    }

    const payload = JSON.stringify({ tabId, at: now })
    window.localStorage.setItem(key, payload)

    // Re-read in case another tab wrote in between.
    const verify = window.localStorage.getItem(key)
    const verified = verify ? (JSON.parse(verify) as { tabId?: string }) : null
    if (verified?.tabId !== tabId) {
      localClaims.add(notificationId)
      return false
    }
  } catch {
    // Storage unavailable — fall through to single-tab claim.
  }

  localClaims.add(notificationId)

  const ch = getChannel()
  if (ch) {
    const message: ClaimMessage = { type: 'claim', notificationId, tabId }
    ch.postMessage(message)
  }

  // Best-effort cleanup of stale keys.
  try {
    window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return
        const parsed = JSON.parse(raw) as { tabId?: string }
        if (parsed?.tabId === tabId) {
          window.localStorage.removeItem(key)
        }
      } catch {
        // ignore
      }
    }, CLAIM_TTL_MS)
  } catch {
    // ignore
  }

  return true
}
