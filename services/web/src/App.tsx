import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { ProjectBoardPage } from '@/pages/ProjectBoardPage'
import { ProjectBacklogPage } from '@/pages/ProjectBacklogPage'
import { ProjectIssuesPage } from '@/pages/ProjectIssuesPage'
import { ProjectSettingsPage } from '@/pages/ProjectSettingsPage'
import { IssueDetailPage } from '@/pages/IssueDetailPage'
import { MyIssuesPage } from '@/pages/MyIssuesPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { UserSettingsPage } from '@/pages/UserSettingsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { WebhooksPage } from '@/pages/WebhooksPage'

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<Navigate to="board" replace />} />
        <Route path="/projects/:id/board" element={<ProjectBoardPage />} />
        <Route path="/projects/:id/backlog" element={<ProjectBacklogPage />} />
        <Route path="/projects/:id/issues" element={<ProjectIssuesPage />} />
        <Route path="/projects/:id/settings" element={<ProjectSettingsPage />} />
        <Route path="/projects/:id/webhooks" element={<WebhooksPage />} />
        <Route path="/issues" element={<MyIssuesPage />} />
        <Route path="/issues/:id" element={<IssueDetailPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<UserSettingsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
