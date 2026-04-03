import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  cacheDir: 'node_modules/.vite',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    // REST only — Socket.IO connects directly to the API (see src/lib/socket.ts) to avoid
    // fragile WS proxy EPIPE/ECONNRESET when :4000 restarts or is down.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
