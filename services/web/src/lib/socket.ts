import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

// ─── Connection state (observable from React via onSocketStatus) ────────────

type SocketStatus = 'connected' | 'connecting' | 'disconnected'
type StatusListener = (status: SocketStatus) => void
const statusListeners = new Set<StatusListener>()
let currentStatus: SocketStatus = 'disconnected'

function setStatus(status: SocketStatus) {
  if (currentStatus === status) return
  currentStatus = status
  statusListeners.forEach((fn) => fn(status))
}

/** Subscribe to socket connection status changes. Returns unsubscribe function. */
export function onSocketStatus(fn: StatusListener): () => void {
  statusListeners.add(fn)
  fn(currentStatus) // Immediately emit current status
  return () => { statusListeners.delete(fn) }
}

export function getSocketStatus(): SocketStatus {
  return currentStatus
}

// ─── URL resolution ─────────────────────────────────────────────────────────

function resolveSocketUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL
  if (explicit) return explicit

  const apiUrl = import.meta.env.VITE_API_URL
  if (typeof apiUrl === 'string' && apiUrl.startsWith('http')) {
    try {
      return new URL(apiUrl).origin
    } catch {
      /* ignore */
    }
  }

  if (import.meta.env.DEV) {
    return 'http://localhost:4000'
  }

  return window.location.origin
}

// ─── Socket lifecycle ───────────────────────────────────────────────────────

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem('accessToken')
    socket = io(resolveSocketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
      timeout: 10000,
    })

    socket.on('connect', () => {
      console.debug('[Socket] Connected:', socket?.id)
      setStatus('connected')
    })

    socket.on('disconnect', (reason) => {
      console.debug('[Socket] Disconnected:', reason)
      setStatus('disconnected')
    })

    socket.on('connect_error', (err) => {
      console.debug('[Socket] Connection error:', err.message)
      setStatus('connecting')
      // If auth error, try refreshing token
      if (err.message?.includes('token') || err.message?.includes('auth')) {
        const freshToken = localStorage.getItem('accessToken')
        if (freshToken && socket) {
          socket.auth = { token: freshToken }
        }
      }
    })

    socket.io.on('reconnect_attempt', () => {
      setStatus('connecting')
    })

    setStatus(socket.connected ? 'connected' : 'connecting')
  }
  return socket
}

export function updateSocketToken(token: string) {
  if (socket) {
    socket.auth = { token }
    socket.disconnect().connect()
  }
}

export function disconnectSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
    setStatus('disconnected')
  }
}

export function isSocketConnected(): boolean {
  return socket?.connected === true
}
