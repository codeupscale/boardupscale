/**
 * Notification sounds from /public/sounds/*.mp3
 *
 * Sound ONLY for:
 * - issue:created, issue:deleted, project:created → create-ticket.mp3
 * - issue:assigned, project:member_added → ticket-assign.mp3
 * - mention → mentions.mp3
 *
 * Comment / status / priority / sprint / org member → badge+inbox only (no sound).
 * Volume = 1. Silent unlock on first click/tap.
 */

export type NotificationSoundKind = 'normal' | 'assign' | 'mention'

const SOUND_FILES: Record<NotificationSoundKind, string> = {
  normal: '/sounds/create-ticket.mp3',
  assign: '/sounds/ticket-assign.mp3',
  mention: '/sounds/mentions.mp3',
}

/** Only these types play a sound. Everything else is silent (badge/inbox still update). */
const SOUND_ENABLED_TYPES = new Set([
  'issue:created',
  'issue:deleted',
  'issue:assigned',
  'mention',
  'project:created',
  'project:member_added',
])

const ASSIGN_SOUND_TYPES = new Set(['issue:assigned', 'project:member_added'])
const MENTION_SOUND_TYPES = new Set(['mention'])
const NORMAL_SOUND_TYPES = new Set(['issue:created', 'issue:deleted', 'project:created'])

let unlockBound = false
let audioUnlocked = false
let lastPlayedAt = 0
const DEBOUNCE_MS = 1200

const players = new Map<NotificationSoundKind, HTMLAudioElement>()

function getPlayer(kind: NotificationSoundKind): HTMLAudioElement {
  let audio = players.get(kind)
  if (!audio) {
    audio = new Audio(SOUND_FILES[kind])
    audio.preload = 'auto'
    audio.volume = 1
    players.set(kind, audio)
  }
  audio.volume = 1
  return audio
}

/** Resolve which MP3 to play, or null if this type should be silent. */
export function resolveNotificationSoundKind(
  type?: string | null,
  _data?: Record<string, unknown> | null,
): NotificationSoundKind | null {
  if (!type || !SOUND_ENABLED_TYPES.has(type)) return null
  if (MENTION_SOUND_TYPES.has(type)) return 'mention'
  if (ASSIGN_SOUND_TYPES.has(type)) return 'assign'
  if (NORMAL_SOUND_TYPES.has(type)) return 'normal'
  return null
}

/** Bind once: first click/tap silently unlocks all notification sounds. */
export function unlockNotificationAudio(): void {
  if (unlockBound || typeof window === 'undefined') return
  unlockBound = true

  const unlock = () => {
    const kinds: NotificationSoundKind[] = ['normal', 'assign', 'mention']
    void Promise.all(
      kinds.map(async (kind) => {
        const audio = getPlayer(kind)
        try {
          audio.muted = true
          audio.volume = 0
          await audio.play()
          audio.pause()
          audio.currentTime = 0
          audio.muted = false
          audio.volume = 1
        } catch {
          // Ignore — will retry after another gesture
        }
      }),
    ).then(() => {
      audioUnlocked = true
    })
  }

  window.addEventListener('pointerdown', unlock, { once: true, capture: true })
  window.addEventListener('touchstart', unlock, { once: true, capture: true })
}

export function isNotificationAudioUnlocked(): boolean {
  return audioUnlocked
}

export async function playNotificationSound(
  enabled: boolean,
  options?: { type?: string | null; data?: Record<string, unknown> | null },
): Promise<void> {
  if (!enabled) return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  if (typeof window === 'undefined') return

  const kind = resolveNotificationSoundKind(options?.type, options?.data)
  if (!kind) return

  const now = Date.now()
  if (now - lastPlayedAt < DEBOUNCE_MS) return
  lastPlayedAt = now

  const audio = getPlayer(kind)
  audio.volume = 1

  try {
    audio.pause()
    audio.currentTime = 0
    await audio.play()
    audioUnlocked = true
  } catch {
    // Autoplay blocked until a user gesture unlocks audio.
  }
}
