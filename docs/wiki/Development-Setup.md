# Development Setup

Get a full local development environment running with hot reload in minutes.

---

## Prerequisites

- **Node.js** 20+ (`node --version`)
- **Docker** 24+ and **Docker Compose** v2
- **Git**

---

## 1. Clone & Configure

```bash
git clone https://github.com/codeupscale/boardupscale.git
cd boardupscale
cp .env.example .env
```

The default `.env.example` is pre-configured for local development — no changes needed to get started.

---

## 2. Start Infrastructure

Start only the backing services (database, cache, search, storage, email):

```bash
docker compose up postgres redis elasticsearch minio mailhog -d
```

Wait ~30 seconds for Elasticsearch to initialise on first run.

---

## 3. Install Dependencies

```bash
cd services/api    && npm install && cd ../..
cd services/web    && npm install && cd ../..
cd services/worker && npm install && cd ../..
```

Or use the Makefile shortcut:

```bash
make setup
```

---

## 4. Start Services with Hot Reload

```bash
make dev
```

This starts:
- API on `http://localhost:4000` (NestJS with `--watch`)
- Web on `http://localhost:3000` (Vite HMR)
- Worker (BullMQ with `--watch`)

Or start them individually in separate terminals:

```bash
# Terminal 1 — API
cd services/api && npm run start:dev

# Terminal 2 — Web
cd services/web && npm run dev

# Terminal 3 — Worker
cd services/worker && npm run start:dev
```

---

## 5. Open the App

Navigate to `http://localhost:3000` and register your first account.

View dev emails at `http://localhost:8025` (MailHog).
View MinIO storage at `http://localhost:9001` (login: `boardupscale` / `boardupscale`).

---

## Make Targets

| Command | Description |
|---------|-------------|
| `make setup` | Install all npm dependencies |
| `make dev` | Start all services with hot reload |
| `make start` | Start in production mode |
| `make stop` | Stop all Docker services |
| `make logs` | Tail logs for all services |
| `make logs-api` | Tail API logs only |
| `make shell-db` | Open a psql shell |
| `make clean` | Stop + remove volumes (⚠️ deletes all data) |

---

## Database Migrations

```bash
cd services/api

# Apply all pending migrations
npm run migration:run

# Roll back the last migration
npm run migration:revert

# Show applied / pending migrations
npm run migration:show

# Generate a new migration after changing an entity
npm run migration:generate src/database/migrations/AddDueDateToIssues
```

Migrations run automatically on startup in development. In production, run `migration:run` before restarting the API.

---

## Running Tests

```bash
cd services/api

# Unit tests
npm test

# Unit tests with coverage
npm run test:cov

# E2E tests (requires running database)
npm run test:e2e

# Watch mode
npm run test:watch
```

---

## Project Structure

```
boardupscale/
├── services/
│   ├── api/
│   │   └── src/
│   │       ├── common/          # Guards, decorators, interceptors, pipes
│   │       ├── config/          # Configuration (config.ts)
│   │       ├── database/
│   │       │   └── migrations/  # TypeORM migration files
│   │       └── modules/         # Feature modules (issues, boards, auth, …)
│   │           └── issues/
│   │               ├── entities/     # TypeORM entity
│   │               ├── dto/          # Request DTOs with validation
│   │               ├── issues.controller.ts
│   │               ├── issues.service.ts
│   │               └── issues.module.ts
│   ├── web/
│   │   └── src/
│   │       ├── components/  # Shared UI components
│   │       ├── hooks/       # TanStack Query hooks
│   │       ├── pages/       # Route-level page components
│   │       ├── store/       # Zustand stores
│   │       ├── types/       # TypeScript type definitions
│   │       └── lib/api.ts   # Axios client with auth interceptor
│   └── worker/
│       └── src/
│           ├── automation/  # Automation rule processor
│           ├── email/       # Email job processor
│           ├── notification/# Notification job processor
│           ├── search/      # Elasticsearch index job processor
│           └── webhook/     # Outgoing webhook job processor
├── docker-compose.yml
├── docker-compose.override.yml  # Dev overrides (ports, hot reload volumes)
└── .env.example
```

---

## Adding a New Feature Module

Follow the existing pattern:

```bash
# 1. Create the NestJS module
nest generate module modules/my-feature
nest generate controller modules/my-feature
nest generate service modules/my-feature

# 2. Create the TypeORM entity
# services/api/src/modules/my-feature/entities/my-feature.entity.ts

# 3. Create DTOs
# services/api/src/modules/my-feature/dto/create-my-feature.dto.ts

# 4. Generate migration
npm run migration:generate src/database/migrations/CreateMyFeature

# 5. Register the module in app.module.ts

# 6. Add TanStack Query hooks in services/web/src/hooks/useMyFeature.ts

# 7. Add the route in services/web/src/App.tsx
```
