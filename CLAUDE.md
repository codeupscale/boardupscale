# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

**Pre-implementation.** The repository currently contains only `Boardupscale_SRS.md` — the Software Requirements Specification. No application code exists yet. All architectural decisions below are drawn from that SRS.

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
