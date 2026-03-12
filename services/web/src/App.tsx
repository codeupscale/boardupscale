import React, { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoadingPage } from '@/components/ui/spinner'
import { useAuthStore } from '@/store/auth.store'

// Auth pages — eager imports (first-load pages)
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { OAuthCallbackPage } from '@/pages/auth/OAuthCallbackPage'
import { SamlCallbackPage } from '@/pages/auth/SamlCallbackPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage'
import { AcceptInvitePage } from '@/pages/auth/AcceptInvitePage'
import { GithubCallbackPage } from '@/pages/auth/GithubCallbackPage'

// Lazy-loaded pages (code-split)
const DashboardPage = React.lazy(() =>
  import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage }))
)
const ProjectsPage = React.lazy(() =>
  import('@/pages/ProjectsPage').then(m => ({ default: m.ProjectsPage }))
)
const ProjectBoardPage = React.lazy(() =>
  import('@/pages/ProjectBoardPage').then(m => ({ default: m.ProjectBoardPage }))
)
const ProjectBacklogPage = React.lazy(() =>
  import('@/pages/ProjectBacklogPage').then(m => ({ default: m.ProjectBacklogPage }))
)
const ProjectIssuesPage = React.lazy(() =>
  import('@/pages/ProjectIssuesPage').then(m => ({ default: m.ProjectIssuesPage }))
)
const ProjectSettingsPage = React.lazy(() =>
  import('@/pages/ProjectSettingsPage').then(m => ({ default: m.ProjectSettingsPage }))
)
const ProjectReportsPage = React.lazy(() =>
  import('@/pages/ProjectReportsPage').then(m => ({ default: m.ProjectReportsPage }))
)
const ProjectReleasesPage = React.lazy(() =>
  import('@/pages/ProjectReleasesPage').then(m => ({ default: m.ProjectReleasesPage }))
)
const ProjectTrashPage = React.lazy(() =>
  import('@/pages/ProjectTrashPage').then(m => ({ default: m.ProjectTrashPage }))
)
const ProjectAutomationsPage = React.lazy(() =>
  import('@/pages/ProjectAutomationsPage').then(m => ({ default: m.ProjectAutomationsPage }))
)
const IssueDetailPage = React.lazy(() =>
  import('@/pages/IssueDetailPage').then(m => ({ default: m.IssueDetailPage }))
)
const MyIssuesPage = React.lazy(() =>
  import('@/pages/MyIssuesPage').then(m => ({ default: m.MyIssuesPage }))
)
const NotificationsPage = React.lazy(() =>
  import('@/pages/NotificationsPage').then(m => ({ default: m.NotificationsPage }))
)
const UserSettingsPage = React.lazy(() =>
  import('@/pages/UserSettingsPage').then(m => ({ default: m.UserSettingsPage }))
)
const RoleManagementPage = React.lazy(() =>
  import('@/pages/RoleManagementPage').then(m => ({ default: m.RoleManagementPage }))
)
const NotFoundPage = React.lazy(() =>
  import('@/pages/NotFoundPage').then(m => ({ default: m.NotFoundPage }))
)
const WebhooksPage = React.lazy(() =>
  import('@/pages/WebhooksPage').then(m => ({ default: m.WebhooksPage }))
)
const TimesheetPage = React.lazy(() =>
  import('@/pages/TimesheetPage').then(m => ({ default: m.TimesheetPage }))
)
const AuditLogPage = React.lazy(() =>
  import('@/pages/AuditLogPage').then(m => ({ default: m.AuditLogPage }))
)
const TeamPage = React.lazy(() =>
  import('@/pages/TeamPage').then(m => ({ default: m.TeamPage }))
)
const ImportPage = React.lazy(() =>
  import('@/pages/ImportPage').then(m => ({ default: m.ImportPage }))
)
const LandingPage = React.lazy(() =>
  import('@/pages/LandingPage').then(m => ({ default: m.LandingPage }))
)
const PricingPage = React.lazy(() =>
  import('@/pages/PricingPage').then(m => ({ default: m.PricingPage }))
)
const BillingPage = React.lazy(() =>
  import('@/pages/BillingPage').then(m => ({ default: m.BillingPage }))
)
const PrivacyPolicyPage = React.lazy(() =>
  import('@/pages/PrivacyPolicyPage').then(m => ({ default: m.PrivacyPolicyPage }))
)
const TermsOfServicePage = React.lazy(() =>
  import('@/pages/TermsOfServicePage').then(m => ({ default: m.TermsOfServicePage }))
)
const CookiePolicyPage = React.lazy(() =>
  import('@/pages/CookiePolicyPage').then(m => ({ default: m.CookiePolicyPage }))
)
const ProjectPagesPage = React.lazy(() =>
  import('@/pages/ProjectPagesPage').then(m => ({ default: m.ProjectPagesPage }))
)
const ProjectCalendarPage = React.lazy(() =>
  import('@/pages/ProjectCalendarPage').then(m => ({ default: m.ProjectCalendarPage }))
)
const ProjectTimelinePage = React.lazy(() =>
  import('@/pages/ProjectTimelinePage').then(m => ({ default: m.ProjectTimelinePage }))
)
const PageDetailPage = React.lazy(() =>
  import('@/pages/PageDetailPage').then(m => ({ default: m.PageDetailPage }))
)

function RootRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <LandingPage />
}

export default function App() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<RootRoute />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/cookies" element={<CookiePolicyPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/callback" element={<OAuthCallbackPage />} />
        <Route path="/auth/saml/callback" element={<SamlCallbackPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="/github/callback" element={<GithubCallbackPage />} />

        {/* Protected routes */}
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:key" element={<Navigate to="board" replace />} />
          <Route path="/projects/:key/board" element={<ProjectBoardPage />} />
          <Route path="/projects/:key/backlog" element={<ProjectBacklogPage />} />
          <Route path="/projects/:key/issues" element={<ProjectIssuesPage />} />
          <Route path="/projects/:key/reports" element={<ProjectReportsPage />} />
          <Route path="/projects/:key/automations" element={<ProjectAutomationsPage />} />
          <Route path="/projects/:key/settings" element={<ProjectSettingsPage />} />
          <Route path="/projects/:key/webhooks" element={<WebhooksPage />} />
          <Route path="/projects/:key/releases" element={<ProjectReleasesPage />} />
          <Route path="/projects/:key/calendar" element={<ProjectCalendarPage />} />
          <Route path="/projects/:key/timeline" element={<ProjectTimelinePage />} />
          <Route path="/projects/:key/trash" element={<ProjectTrashPage />} />
          <Route path="/projects/:key/pages" element={<ProjectPagesPage />} />
          <Route path="/projects/:key/pages/:pageId" element={<PageDetailPage />} />
          <Route path="/timesheet" element={<TimesheetPage />} />
          <Route path="/issues" element={<MyIssuesPage />} />
          <Route path="/issues/:id" element={<IssueDetailPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<UserSettingsPage />} />
          <Route path="/settings/roles" element={<RoleManagementPage />} />
          <Route path="/settings/team" element={<TeamPage />} />
          <Route path="/settings/billing" element={<BillingPage />} />
          <Route path="/admin/audit-logs" element={<AuditLogPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
