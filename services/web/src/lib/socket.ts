import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_WS_URL || window.location.origin, {
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
