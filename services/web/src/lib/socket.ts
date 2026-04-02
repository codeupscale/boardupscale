import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

/**
 * In Vite dev, the app is served from :3000 but the API (and Socket.IO) run on :4000.
 * Connecting via `window.location.origin` forces traffic through Vite's WS proxy, which
 * spams EPIPE/ECONNRESET when the API restarts or is offline. Prefer a direct URL in dev.
 */
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

export function getSocket(): Socket {
  if (!socket) {
    socket = io(resolveSocketUrl(), {
      auth: { token: localStorage.getItem('accessToken') },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    })
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
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
