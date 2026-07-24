import React, { Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, type Location } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProjectLayout } from '@/components/layout/project-layout'
import { useAuthStore } from '@/store/auth.store'
import { RoleGuard } from '@/components/common/role-guard'
import { UserRole } from '@/types'
import { ISSUE_MODAL_BACKGROUND_KEY } from '@/lib/issue-navigation'
import { IssueDetailPage } from '@/pages/IssueDetailPage'

import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { OAuthCallbackPage } from '@/pages/auth/OAuthCallbackPage'
import { SamlCallbackPage } from '@/pages/auth/SamlCallbackPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage'
import { AcceptInvitePage } from '@/pages/auth/AcceptInvitePage'
import { GithubCallbackPage } from '@/pages/auth/GithubCallbackPage'
import { PrivacyPage } from '@/pages/PrivacyPage'

const DashboardPage = React.lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const ProjectsPage = React.lazy(() =>
  import('@/pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
)
const ProjectBoardPage = React.lazy(() =>
  import('@/pages/ProjectBoardPage').then((m) => ({ default: m.ProjectBoardPage })),
)
const ProjectBacklogPage = React.lazy(() =>
  import('@/pages/ProjectBacklogPage').then((m) => ({ default: m.ProjectBacklogPage })),
)
const ProjectIssuesPage = React.lazy(() =>
  import('@/pages/ProjectIssuesPage').then((m) => ({ default: m.ProjectIssuesPage })),
)
const ProjectEpicsPage = React.lazy(() =>
  import('@/pages/ProjectEpicsPage').then((m) => ({ default: m.ProjectEpicsPage })),
)
const ProjectSettingsPage = React.lazy(() =>
  import('@/pages/ProjectSettingsPage').then((m) => ({ default: m.ProjectSettingsPage })),
)
const ProjectReportsPage = React.lazy(() =>
  import('@/pages/ProjectReportsPage').then((m) => ({ default: m.ProjectReportsPage })),
)
const ProjectReleasesPage = React.lazy(() =>
  import('@/pages/ProjectReleasesPage').then((m) => ({ default: m.ProjectReleasesPage })),
)
const ProjectTrashPage = React.lazy(() =>
  import('@/pages/ProjectTrashPage').then((m) => ({ default: m.ProjectTrashPage })),
)
const ProjectAutomationsPage = React.lazy(() =>
  import('@/pages/ProjectAutomationsPage').then((m) => ({ default: m.ProjectAutomationsPage })),
)
const MyIssuesPage = React.lazy(() =>
  import('@/pages/MyIssuesPage').then((m) => ({ default: m.MyIssuesPage })),
)
const NotificationsPage = React.lazy(() =>
  import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
)
const UserSettingsPage = React.lazy(() =>
  import('@/pages/UserSettingsPage').then((m) => ({ default: m.UserSettingsPage })),
)
const RoleManagementPage = React.lazy(() =>
  import('@/pages/RoleManagementPage').then((m) => ({ default: m.RoleManagementPage })),
)
const NotFoundPage = React.lazy(() =>
  import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)
const WebhooksPage = React.lazy(() =>
  import('@/pages/WebhooksPage').then((m) => ({ default: m.WebhooksPage })),
)
const TimesheetPage = React.lazy(() =>
  import('@/pages/TimesheetPage').then((m) => ({ default: m.TimesheetPage })),
)
const AuditLogPage = React.lazy(() =>
  import('@/pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })),
)
const TeamPage = React.lazy(() =>
  import('@/pages/TeamPage').then((m) => ({ default: m.TeamPage })),
)
const ImportPage = React.lazy(() =>
  import('@/pages/ImportPage').then((m) => ({ default: m.ImportPage })),
)
const JiraMigrationPage = React.lazy(() =>
  import('@/pages/migrate/JiraMigrationPage').then((m) => ({ default: m.JiraMigrationPage })),
)
const MigrationHistoryPage = React.lazy(() =>
  import('@/pages/migrate/MigrationHistoryPage').then((m) => ({
    default: m.MigrationHistoryPage,
  })),
)
const BillingPage = React.lazy(() =>
  import('@/pages/BillingPage').then((m) => ({ default: m.BillingPage })),
)
const OrgOwnerDashboardPage = React.lazy(() =>
  import('@/pages/OrgOwnerDashboardPage').then((m) => ({
    default: m.OrgOwnerDashboardPage,
  })),
)
const ProjectPagesPage = React.lazy(() =>
  import('@/pages/ProjectPagesPage').then((m) => ({ default: m.ProjectPagesPage })),
)
const ProjectCalendarPage = React.lazy(() =>
  import('@/pages/ProjectCalendarPage').then((m) => ({ default: m.ProjectCalendarPage })),
)
const ProjectTimelinePage = React.lazy(() =>
  import('@/pages/ProjectTimelinePage').then((m) => ({ default: m.ProjectTimelinePage })),
)
const PageDetailPage = React.lazy(() =>
  import('@/pages/PageDetailPage').then((m) => ({ default: m.PageDetailPage })),
)

function RootRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const role = useAuthStore((s) => s.user?.role)
  if (isAuthenticated) {
    if (role === UserRole.OWNER) {
      return <Navigate to="/org/dashboard" replace />
    }
    return <Navigate to="/dashboard" replace />
  }
  return <Navigate to="/login" replace />
}

function ProtectedRoutes() {
  return (
    <Route element={<AppLayout />}>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route
        path="/org/dashboard"
        element={
          <RoleGuard roles={[UserRole.OWNER]}>
            <OrgOwnerDashboardPage />
          </RoleGuard>
        }
      />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:key" element={<ProjectLayout />}>
        <Route index element={<Navigate to="board" replace />} />
        <Route path="board" element={<ProjectBoardPage />} />
        <Route path="backlog" element={<ProjectBacklogPage />} />
        <Route path="issues" element={<ProjectIssuesPage />} />
        <Route path="epics" element={<ProjectEpicsPage />} />
        <Route path="reports" element={<ProjectReportsPage />} />
        <Route path="automations" element={<ProjectAutomationsPage />} />
        <Route path="settings" element={<ProjectSettingsPage />} />
        <Route path="webhooks" element={<WebhooksPage />} />
        <Route path="releases" element={<ProjectReleasesPage />} />
        <Route path="calendar" element={<ProjectCalendarPage />} />
        <Route path="timeline" element={<ProjectTimelinePage />} />
        <Route path="trash" element={<ProjectTrashPage />} />
        <Route path="pages" element={<ProjectPagesPage />} />
        <Route path="pages/:pageId" element={<PageDetailPage />} />
      </Route>
      <Route path="/timesheet" element={<TimesheetPage />} />
      <Route path="/issues" element={<MyIssuesPage />} />
      {/* Deep-link / hard-navigation fallback: renders the ticket modal over
          the app shell (no dashboard flash). When opened via in-app links the
          background-location pattern below keeps the originating page visible. */}
      <Route path="/issues/:id" element={<IssueDetailPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/settings" element={<UserSettingsPage />} />
      <Route
        path="/settings/roles"
        element={
          <RoleGuard roles={[UserRole.OWNER]}>
            <RoleManagementPage />
          </RoleGuard>
        }
      />
      <Route
        path="/settings/team"
        element={
          <RoleGuard roles={[UserRole.OWNER, UserRole.ADMINISTRATOR]}>
            <TeamPage />
          </RoleGuard>
        }
      />
      <Route
        path="/settings/billing"
        element={
          <RoleGuard roles={[UserRole.OWNER, UserRole.ADMINISTRATOR]}>
            <BillingPage />
          </RoleGuard>
        }
      />
      <Route
        path="/admin/audit-logs"
        element={
          <RoleGuard roles={[UserRole.OWNER, UserRole.ADMINISTRATOR]}>
            <AuditLogPage />
          </RoleGuard>
        }
      />
      <Route
        path="/import"
        element={
          <RoleGuard roles={[UserRole.OWNER, UserRole.ADMINISTRATOR]}>
            <ImportPage />
          </RoleGuard>
        }
      />
      <Route
        path="/settings/migrate/jira"
        element={
          <RoleGuard roles={[UserRole.OWNER, UserRole.ADMINISTRATOR]}>
            <JiraMigrationPage />
          </RoleGuard>
        }
      />
      <Route
        path="/settings/migrate/history"
        element={
          <RoleGuard roles={[UserRole.OWNER, UserRole.ADMINISTRATOR]}>
            <MigrationHistoryPage />
          </RoleGuard>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  )
}

function MainRoutes({ routeLocation }: { routeLocation: Location }) {
  return (
    <Routes location={routeLocation}>
      <Route path="/" element={<RootRoute />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/auth/callback" element={<OAuthCallbackPage />} />
      <Route path="/auth/saml/callback" element={<SamlCallbackPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/github/callback" element={<GithubCallbackPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      {ProtectedRoutes()}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export function AppRoutes() {
  const location = useLocation()
  const backgroundLocation = (location.state as Record<string, Location> | null)?.[
    ISSUE_MODAL_BACKGROUND_KEY
  ]

  return (
    <>
      {/* When a ticket is opened via an in-app link, render the page the user
          came from (backgroundLocation) so the board/backlog stays visible and
          there is no route-level unmount/flash. */}
      <MainRoutes routeLocation={backgroundLocation ?? location} />

      {/* Ticket modal layer — only mounted when opened over a background page.
          Deep links (no background) are handled by the /issues/:id route above. */}
      {backgroundLocation && (
        <Routes>
          <Route path="/issues/:id" element={<IssueDetailPage />} />
        </Routes>
      )}
    </>
  )
}

export function AppRoutesSuspense({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>
}
