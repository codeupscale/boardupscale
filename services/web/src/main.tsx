import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { ErrorBoundary } from './components/ui/error-boundary'
import App from './App'
import './i18n'
import './index.css'
// Import theme store early so dark class is applied before first paint
import './store/theme.store'
// Initialize PostHog analytics (no-op if VITE_POSTHOG_KEY is not set)
import { initPostHog } from './lib/posthog'
initPostHog()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </HelmetProvider>
  </React.StrictMode>,
)
