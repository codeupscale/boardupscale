# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

**In active development.** Core modules are built — 28 NestJS modules (issues, boards, sprints, auth, automation, GitHub integration, search, notifications, etc.) and a React/Vite frontend with pages, components, hooks, and store. The SRS (`Boardupscale_SRS.md`) remains the authoritative source for any unimplemented features.

## Project Overview

Boardupscale is a self-hosted Jira replacement for CodeUpscale — a multi-tenant, web-based project management platform supporting Scrum, Kanban, and hybrid agile methodologies.

## Planned Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Next.js 14, TypeScript |
| UI | Tailwind CSS + shadcn/ui (Radix UI primitives) |
| Client state | Zustand |
| Server state | TanStack Query |
| Backend | NestJS + TypeScript (Node.js 20+) |
| Background jobs | BullMQ (Redis-backed) |
| Primary DB | PostgreSQL 15+ (with pgvector extension) |
| Cache / sessions | Redis 7+ |
| Search | Elasticsearch 8+ |
| File storage | MinIO (local dev) / AWS S3 (production) |
| Real-time | Socket.io (WebSocket) |
| Auth | Passport.js — JWT with refresh-token rotation, OAuth 2.0 (Google/GitHub/Microsoft), SAML 2.0 |
| Containerisation | Docker Compose (dev), Kubernetes (prod) |
| Email testing | MailHog |

## Planned Architecture

```
services/
├── api/          # NestJS backend
├── web/          # Next.js frontend
├── worker/       # BullMQ background job processor
└── nginx/        # Reverse proxy (port 80/443)
migrations/       # Versioned, reversible DB migrations
scripts/          # DB init and seed scripts
docker-compose.yml
docker-compose.override.yml  # Local dev overrides
.env.example
```

**Service ports (local dev):** Nginx 80/443, Web 3000, API 4000, PostgreSQL 5432, Redis 6379, Elasticsearch 9200, MinIO 9000/9001, MailHog 8025.

## Key Architectural Decisions (from SRS)

- **Multi-tenant with complete data isolation** — every query must be tenant-scoped (FR-TEAM-001).
- **Layered data strategy** — PostgreSQL for writes (ACID), Redis for caching reads and sessions, Elasticsearch for full-text/faceted search.
- **Event-driven background work** — notifications, emails, webhooks, and automation rules run through BullMQ workers, not in the request path.
- **Real-time board updates** — Socket.io pub-sub; Redis used as the pub-sub broker between API instances.
- **JWT with refresh-token rotation** — access token expiry 15 min, refresh token 7 days (FR-AUTH-008).
- **Soft deletes with 30-day recovery** — never hard-delete user content by default.
- **Immutable audit trail** — 2-year retention required (FR-USER-004, FR-ADM).
- **RBAC** — four predefined roles (Admin, Manager, Member, Viewer) plus custom roles; granular permissions at project, board, and issue level (FR-TEAM-003/004).

## Issue Hierarchy

Epic → Story → Task/Bug → Subtask

## Priority Levels (from SRS)

- **P0** — Critical (must ship in v1)
- **P1** — High
- **P2** — Medium
- **P3** — Low (post-launch)

## Performance Targets (NFR)

- API response: < 200 ms (p95)
- Page load: < 2 s
- Concurrent users: 10,000
- Test coverage target: 80%+

---

## Multi-Agent Pipeline

> **Run the correct flow for the work type. Never run the full feature pipeline for a bug fix.**

### New Feature (full pipeline)
```
/product (design input) → /architect → /database → /migration (GATE)
→ /backend → /worker* → /frontend → /ui* → /realtime*
→ /rbac* → /ai* → /payments* → /github* → /search*
→ /product (GATE) → /qa (GATE) → /security (GATE) → /reviewer (GATE) → /docs → /devops
```
`*` = invoke only if the feature touches that domain

### Bug Fix
```
/backend and/or /frontend → /qa (GATE) → /security* → /reviewer (GATE)
```

### DB / Schema Change
```
/database → /migration (GATE) → /backend → /qa (GATE) → /reviewer (GATE)
```

### Payment / Billing Feature
```
/architect → /database → /migration (GATE) → /backend → /payments (GATE)
→ /frontend → /qa (GATE) → /security (GATE) → /reviewer (GATE)
```

### AI Feature
```
/ai (design) → /architect → /database → /migration (GATE)
→ /backend → /worker → /frontend
→ /qa (GATE) → /security (GATE) → /reviewer (GATE) → /docs
```

---

**Blocking gates — nothing merges until ALL applicable gates pass:**

| Gate | Blocks On |
|------|----------|
| `/migration` | Nullable violations, missing indexes, empty `down()`, no `organizationId` |
| `/product` | Any P0 feature checklist item FAIL or MISSING |
| `/qa` | Failing tests OR coverage < 80% OR no tenant-isolation test for new endpoint |
| `/security` | Tenant bypass, missing guard, hardcoded secret, raw SQL injection |
| `/reviewer` | BLOCK verdict — logic errors, architecture violations, broken contracts |

---

## Agent Roster (21 Agents)

All agents are modeled as **10+ year senior engineers** — SOLID lovers, multi-tenant experts, clean code advocates, event-driven architects.

### Orchestrators (start here)
| Agent | File | Role |
|-------|------|------|
| `/master` | `.claude/agents/master.md` | Strategic commander — break big goals into tasks, sequence pipelines, own integration quality, special modes: `audit`, `performance`, `launch-ready` |
| `/pipeline` | `.claude/agents/pipeline.md` | Execution engine — runs a single task through the full agent flow, enforces all gates, runs brutal QA, commits code, creates PR |

**How to use:**
- Big goal / multi-task delivery → `/master "<goal>"`
- Single task / feature / bug fix → `/pipeline "<task>"`

### Core Engineering
| Agent | File | Expertise |
|-------|------|-----------|
| `/architect` | `.claude/agents/architect.md` | SOLID, DDD, CQRS, event-driven, NestJS module design, monolith/microservices, scalability |
| `/backend` | `.claude/agents/backend.md` | NestJS 11, TypeORM 0.3+, guards, interceptors, CQRS, class-validator, Zod config |
| `/frontend` | `.claude/agents/frontend.md` | Next.js 16, React 19, Server Components, TanStack Query v5, Zustand v5, next-safe-action |
| `/database` | `.claude/agents/database.md` | PostgreSQL 15+, pgvector (HNSW/IVFFlat), hybrid search, RLS, multi-tenant schema design |

### Domain Specialists
| Agent | File | Expertise |
|-------|------|-----------|
| `/product` | `.claude/agents/product.md` | Jira, Linear, Shortcut, ClickUp — PM tool competitive audit, feature completeness gate |
| `/ai` | `.claude/agents/ai.md` | pgvector embeddings, LLM APIs (OpenAI/Anthropic), RAG, duplicate detection, cost control |
| `/rbac` | `.claude/agents/rbac.md` | RBAC design, permission granularity, custom roles, tenant isolation patterns, cache |
| `/payments` | `.claude/agents/payments.md` | Stripe API dahlia, Connect, subscriptions, webhook idempotency, PCI compliance |
| `/github` | `.claude/agents/github.md` | GitHub Apps, webhook processing, issue auto-linking, REST v3 + GraphQL v4 |
| `/search` | `.claude/agents/search.md` | Elasticsearch 8, per-org index strategy, query DSL, facets, sync pipeline |
| `/ui` | `.claude/agents/ui.md` | shadcn/ui latest, Tailwind CSS v4, Radix UI, WCAG 2.2, CVA variants, dark mode |

### Infrastructure & Reliability
| Agent | File | Expertise |
|-------|------|-----------|
| `/worker` | `.claude/agents/worker.md` | BullMQ, job retries/backoff/timeout/failed(), idempotency, queue naming |
| `/migration` | `.claude/agents/migration.md` | PostgreSQL migration safety — nullable, rollback, indexes, tenant scope **(GATE)** |
| `/realtime` | `.claude/agents/realtime.md` | Socket.io, JWT on handshake, tenant room isolation, Redis adapter, reconnect |
| `/devops` | `.claude/agents/devops.md` | Docker multi-stage, Kubernetes, GitHub Actions CI/CD, secrets, zero-downtime deploy |

### Quality Gates
| Agent | File | Expertise |
|-------|------|-----------|
| `/qa` | `.claude/agents/qa.md` | Jest, Supertest integration tests, Playwright E2E, 80%+ coverage enforcement **(GATE)** |
| `/security` | `.claude/agents/security.md` | OWASP Top 10, JWT attacks, multi-tenant isolation, cloud hardening **(GATE)** |
| `/reviewer` | `.claude/agents/reviewer.md` | SOLID, clean code, API design, TypeScript, BLOCK/WARN/APPROVE verdicts **(GATE)** |
| `/docs` | `.claude/agents/docs.md` | OpenAPI/Swagger, ADRs, wiki pages, changelog |
