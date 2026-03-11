# Changelog

All notable changes to Boardupscale are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Boardupscale adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Anything merged to `main` but not yet tagged goes here.

---

## [1.0.0] — 2026-03-11

Initial public open-source release of Boardupscale — a self-hosted Jira
replacement built with NestJS, React, PostgreSQL, Redis, and Elasticsearch.

### Added

#### Core Platform
- Multi-tenant architecture with complete data isolation per organisation
- JWT authentication with 15-minute access tokens and 7-day refresh-token rotation
- Email/password registration, login, and password reset
- Email verification flow with resend support
- Two-factor authentication (TOTP) with backup codes
- Google OAuth 2.0 and GitHub OAuth 2.0 login
- SAML 2.0 SSO with per-organisation IdP configuration (Okta, Azure AD, OneLogin)
- Role-based access control: Admin, Manager, Member, Viewer system roles
- Custom per-organisation roles with granular permission grants
- API key authentication for external integrations
- Rate limiting on all authentication endpoints (strict throttle)

#### Issue Tracking
- Full issue hierarchy: Epic → Story → Task/Bug → Subtask
- Configurable issue statuses per project with default status support
- Priority levels (Critical, High, Medium, Low, None)
- Labels, components, versions, and custom fields
- Issue linking (blocks, is blocked by, relates to, duplicates)
- Issue watchers and @mention notifications
- File attachments with MinIO/S3 storage backend
- Soft-delete with 30-day recovery window
- Work logging and time tracking with timesheet reports

#### Agile Boards
- Scrum and Kanban board views with drag-and-drop
- WIP (Work In Progress) limits per column
- Swimlane grouping (by assignee, priority, or epic)
- Quick filters (My Issues, Unassigned, Overdue)
- Board column customisation

#### Sprint Management
- Sprint creation, start, and completion
- Backlog management with drag-to-sprint
- Velocity chart
- Burndown and burnup charts
- Sprint report with completed/incomplete issue breakdown

#### Reporting & Dashboards
- Created-vs-resolved chart
- Cycle time chart
- Issue breakdown charts (by type, priority, assignee)
- Workload chart per team member
- Timesheet report with CSV export

#### Collaboration
- Real-time board updates via Socket.io WebSocket
- In-app notification centre
- Email notifications (configurable per user)
- Activity stream per issue and per project
- Rich text comments with @mentions
- Project wiki (Pages) with hierarchical structure

#### Search
- Full-text search powered by Elasticsearch
- Saved filters and views per project
- Global search across issues, projects, and pages

#### Integrations
- GitHub webhook integration — link commits and PRs to issues by key mention
- REST API with OpenAPI/Swagger documentation at `/api/docs`
- Outgoing webhooks with configurable events and HMAC signature verification
- Webhook delivery log with retry support
- Rule-based automation engine (trigger → condition → action)
- CSV and JSON project import

#### Developer Experience
- TypeORM migrations replacing legacy `init-db.sql` bootstrap
- Auto-runs pending migrations on API startup (`migrationsRun: true`)
- BullMQ worker for background jobs (notifications, emails, webhooks, automation, search indexing)
- Docker Compose single-command setup (`docker compose up -d`)
- Hot-reload development stack (`make dev`)
- Makefile with common operations (`make logs`, `make shell-db`, etc.)
- Swagger UI available in all environments at `/api/docs`

#### Observability
- Health check endpoint at `GET /api/health`
- Immutable audit log for all state-changing operations (2-year retention intent)
- Anonymous opt-out telemetry ping on startup (`TELEMETRY_ENABLED=false` to opt out)

#### Open Source Infrastructure
- AGPL-3.0 licence
- GitHub Actions CI: lint, TypeScript compile, tests, Docker Compose smoke test
- GitHub Actions release workflow: multi-arch Docker images pushed to GHCR on tag
- Issue templates: bug report, feature request
- Pull request template with merge checklist
- `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE-ENTERPRISE`

---

[Unreleased]: https://github.com/codeupscale/boardupscale/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/codeupscale/boardupscale/releases/tag/v1.0.0
