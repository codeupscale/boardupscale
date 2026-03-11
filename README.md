<div align="center">

<h1>Boardupscale</h1>

<p><strong>The free, open-source alternative to Jira.</strong></p>

<p>
  Everything Jira does — Scrum boards, Kanban, sprints, epics, time tracking, real-time collaboration, and more — with <strong>no per-seat pricing, no vendor lock-in, and no limits</strong>. 100% free and open-source. Self-host on your own infrastructure in minutes.
</p>

<p>
  <a href="#-quick-start"><strong>Quick Start →</strong></a>
</p>

<p>
  <img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="License: AGPL-3.0" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square" alt="Node.js 20+" />
  <img src="https://img.shields.io/badge/docker-ready-2496ed?style=flat-square&logo=docker&logoColor=white" alt="Docker ready" />
  <img src="https://img.shields.io/badge/PostgreSQL-15%2B-4169e1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 15+" />
  <img src="https://img.shields.io/github/actions/workflow/status/codeupscale/boardupscale/ci.yml?branch=main&style=flat-square&label=CI" alt="CI status" />
</p>

</div>

---

## ✨ Features

### 🗂 Issue Tracking
- Hierarchical issues: **Epics → Stories → Tasks → Subtasks**
- Custom fields, labels, priority levels (Critical / High / Medium / Low)
- File attachments, @mentions, and inline comments
- Issue linking (blocks, duplicates, relates to)
- Bulk operations — assign, transition, and label multiple issues at once
- Saved views and filters for power users

### 🏄 Agile Boards
- **Scrum & Kanban** boards with full drag-and-drop
- WIP limits per column to enforce flow
- Swimlanes by assignee, priority, or epic
- Quick filters (my issues, unassigned, by label)
- Customisable board columns and workflow statuses per project

### 🏃 Sprint Management
- Sprint planning with backlog drag-and-drop
- Start, complete, and carry-over sprints
- Burndown & burnup charts, velocity chart, cycle-time chart
- Sprint reports with completed vs. incomplete breakdown

### ⏱ Time Tracking
- Log time directly on issues ("2h 30m" format)
- Weekly timesheets per user
- Billable-hour reports exportable to CSV

### 🔴 Real-time Collaboration
- Live board updates via WebSocket — no page refresh needed
- In-app notifications with read/unread state
- Email notifications for assignments, mentions, and status changes
- Activity stream on every issue

### 🔍 Search
- Full-text search across issues, comments, and pages (Elasticsearch)
- Filters by project, assignee, priority, label, status, and date range
- Saved views — store and share your most-used filters
- Global Cmd+K command palette

### 🐙 GitHub Integration
- Link pull requests and commits to issues automatically
- Auto-transition issues when a PR is merged
- See GitHub activity directly on the issue detail page

### ⚡ Automation
- Rule-based automation engine: **trigger → condition → action**
- Built-in triggers: issue created, status changed, PR merged, sprint started
- Built-in actions: assign user, set priority, post comment, send webhook
- Execution log for every automation run

### 📄 Pages / Docs
- Built-in per-project wiki — no Confluence needed
- Rich text editor with headings, code blocks, tables, checklists, images
- Slash-command menu (`/h1`, `/table`, `/code`, `/todo`)
- Nested page tree with drag-to-reorder
- Real-time collaborative editing via WebSocket

### 🔐 Access Control
- **Multi-tenant** — complete data isolation between organisations
- Four built-in roles: Admin, Manager, Member, Viewer
- Custom roles with granular per-resource permissions
- Project-level permission overrides

### 🔑 Authentication
- Email / password with email verification
- **Google OAuth** and **GitHub OAuth**
- **SAML 2.0 SSO** for enterprise identity providers
- **Two-factor authentication** (TOTP + backup codes)
- Secure JWT with refresh-token rotation (15 min / 7 day)
- Member invitation flow with email-based onboarding

### 🤖 AI Features *(optional, opt-in)*
- GPT-powered issue summaries and descriptions
- Semantic duplicate detection before you create a new issue
- Smart field suggestions (type, priority, assignee) based on issue content
- Natural language search

### 📊 Reporting & Dashboards
- Personal dashboard with assigned issues and recent projects
- Burndown, burnup, velocity, cycle-time, and workload charts
- Created-vs-resolved trend chart
- Sprint intelligence widget with predictive completion
- Export reports to CSV

### 🔗 API & Webhooks
- Full REST API with Swagger docs (`/api/docs`)
- API key authentication for CI/CD and integrations
- Outgoing webhooks with configurable events and retry logic
- **MCP server** — use Boardupscale from Claude Code or Cursor via natural language

### 🖥 Self-hosted & Free
- Single `docker compose up` — up in under 2 minutes
- Runs entirely on your own infrastructure — your data never leaves your server
- **No per-seat pricing. No usage limits. No vendor lock-in. Free forever.**
- Production-ready Docker Compose for VPS deployment
- Anonymous, opt-out telemetry (no PII ever sent)

---

## 🚀 Quick Start

**Requirements:** Docker 24+ and Docker Compose v2

```bash
# 1. Clone the repository
git clone https://github.com/codeupscale/boardupscale.git
cd boardupscale

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET to a long random string

# 3. Start all services
docker compose up -d

# 4. Open the app
open http://localhost:8091
```

That's it. The API runs migrations automatically on first boot — no manual database setup required.

> **First run takes ~2 minutes** while Docker pulls images and the database initialises.

### Default Ports

| Service | URL |
|---------|-----|
| Web app | http://localhost:8091 |
| API | http://localhost:8091/api |
| MailHog (email preview) | http://localhost:8026 |
| MinIO console (file storage) | http://localhost:9011 |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript + React Router v6 |
| UI | Tailwind CSS + shadcn/ui (Radix UI primitives) |
| Backend | NestJS + TypeScript (Node.js 20+) |
| Background jobs | BullMQ (Redis-backed) |
| Primary DB | PostgreSQL 15+ with pgvector |
| Cache / sessions | Redis 7+ |
| Search | Elasticsearch 8+ |
| File storage | MinIO (dev) / AWS S3 (prod) |
| Real-time | Socket.io over WebSocket |
| Auth | JWT + refresh-token rotation, OAuth 2.0, SAML 2.0 |
| Schema migrations | TypeORM migrations (auto-run on startup) |
| Containerisation | Docker Compose (dev), production-ready Compose for VPS |

---

## ⚙️ Configuration

All configuration is done via environment variables. Copy `.env.example` to `.env` and edit as needed.

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Long random string — **change this before deploying** |

### Optional

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Enable Google OAuth login |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Enable GitHub OAuth login |
| `SAML_ENTRY_POINT` / `SAML_CERT` | Enable SAML 2.0 SSO |
| `AI_ENABLED=true` + `OPENAI_API_KEY` | Enable AI-powered features |
| `STRIPE_SECRET_KEY` | Enable billing / subscription management |
| `ELASTICSEARCH_URL` | Full-text search (defaults to local instance) |

See `.env.example` for the full reference with documentation comments.

---

## 🏗 Architecture

```
boardupscale/
├── services/
│   ├── api/          # NestJS REST API + WebSocket server  (port 4000)
│   ├── web/          # React SPA                           (port 3000)
│   ├── worker/       # BullMQ background job processor
│   └── nginx/        # Reverse proxy                       (port 8091)
├── services/api/src/database/migrations/   # TypeORM versioned migrations
├── docker-compose.yml                      # Production / standard deployment
├── docker-compose.override.yml             # Local dev overrides (hot reload)
└── .env.example                            # Environment variable reference
```

**Design principles:**

- **Multi-tenant with complete data isolation** — every query is scoped to an organisation
- **Event-driven** — notifications, emails, webhooks, and automation rules run through BullMQ workers, never in the request path
- **JWT with refresh-token rotation** — 15 min access tokens, 7 day refresh tokens
- **Soft deletes** — user content is recoverable for 30 days
- **Immutable audit trail** — every change is logged with 2-year retention

---

## 🧑‍💻 Development Setup

```bash
# Install all dependencies
cd services/api  && npm install
cd services/web  && npm install
cd services/worker && npm install

# Start infrastructure (postgres, redis, elasticsearch, minio, mailhog)
docker compose up postgres redis elasticsearch minio mailhog -d

# Start services with hot reload
make dev
# or individually:
# cd services/api   && npm run start:dev
# cd services/web   && npm run dev
# cd services/worker && npm run start:dev
```

### Database Migrations

```bash
cd services/api

npm run migration:run       # apply all pending migrations
npm run migration:revert    # roll back the last migration
npm run migration:show      # list applied / pending migrations

# After changing an entity, generate a new migration:
npm run migration:generate src/database/migrations/DescribeYourChange
```

### Useful Make Targets

```bash
make setup    # first-time setup (runs scripts/setup.sh)
make dev      # start all services with hot reload
make start    # start in production mode
make stop     # stop all services
make logs     # tail logs for all services
make logs-api # tail API logs only
make shell-db # open a psql shell
make clean    # stop + remove volumes (destructive!)
```

---

## 🤝 Contributing

We welcome contributions of all kinds — bug reports, feature requests, documentation improvements, and code.

Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** before submitting a pull request.

**Quick contribution guide:**

1. Fork the repository and create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes, write/update tests
3. Ensure CI passes: `npm test`
4. Open a pull request against `main`

---

## 🔒 Security

Found a vulnerability? Please **do not** open a public GitHub issue.

See **[SECURITY.md](SECURITY.md)** for the responsible disclosure process.

---

## 📄 License

Boardupscale is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This means you can freely self-host, modify, and redistribute Boardupscale. If you offer Boardupscale as a hosted service (SaaS), you must release your modifications under the same licence.

See [LICENSE](LICENSE) for the full text.

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/codeupscale">CodeUpscale</a></sub>
</div>
