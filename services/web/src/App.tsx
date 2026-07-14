import { ThemeTransitionOverlay } from '@/components/layout/theme-transition-overlay'
import { AppRoutes, AppRoutesSuspense } from '@/components/routing/app-routes'

export default function App() {
  return (
    <AppRoutesSuspense>
      <ThemeTransitionOverlay />
      <AppRoutes />
    </AppRoutesSuspense>
  )
}
