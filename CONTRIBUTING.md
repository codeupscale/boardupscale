# Contributing to Boardupscale

Thank you for your interest in contributing! Boardupscale is built by the community, for the community. Every contribution — whether it's a bug report, a documentation fix, or a new feature — is genuinely appreciated.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Report a Bug](#how-to-report-a-bug)
- [How to Request a Feature](#how-to-request-a-feature)
- [Development Setup](#development-setup)
- [Making a Pull Request](#making-a-pull-request)
- [Coding Standards](#coding-standards)
- [Commit Message Format](#commit-message-format)
- [Database Migrations](#database-migrations)
- [Running Tests](#running-tests)

---

## Code of Conduct

Be respectful. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) and will enforce it. Harassment, discrimination, or aggressive behaviour will result in a permanent ban.

---

## How to Report a Bug

1. **Search existing issues first** — your bug may already be reported.
2. If not, open a [Bug Report](https://github.com/codeupscale/boardupscale/issues/new?template=bug_report.yml).
3. Include:
   - Steps to reproduce (minimal and specific)
   - Expected behaviour vs actual behaviour
   - Boardupscale version / commit hash
   - Logs (from `docker compose logs api` or `docker compose logs worker`)
   - Operating system and Docker version

> **Security vulnerabilities** — do NOT open a public issue. See [SECURITY.md](SECURITY.md).

---

## How to Request a Feature

1. Search [existing issues and discussions](https://github.com/codeupscale/boardupscale/discussions) to avoid duplicates.
2. Open a [Feature Request](https://github.com/codeupscale/boardupscale/issues/new?template=feature_request.yml) and describe:
   - The problem you're trying to solve
   - Your proposed solution
   - Any alternatives you considered

---

## Development Setup

### Prerequisites

- **Node.js** 20+ (use [nvm](https://github.com/nvm-sh/nvm))
- **Docker** 24+ and **Docker Compose** v2
- **Git**

### First-time Setup

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_FORK/boardupscale.git
cd boardupscale

# 2. Configure environment
cp .env.example .env
# .env already has sensible defaults for local dev — no changes needed to start

# 3. Start infrastructure services
docker compose up postgres redis elasticsearch minio mailhog -d

# 4. Install dependencies
cd services/api    && npm install && cd ../..
cd services/web    && npm install && cd ../..
cd services/worker && npm install && cd ../..

# 5. Start services with hot reload
make dev
```

The app will be available at **http://localhost:8091**.
Email previews (MailHog) at **http://localhost:8026**.

### Service Ports (local dev)

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API | http://localhost:4000 |
| PostgreSQL | localhost:5435 |
| Redis | localhost:6381 |
| Elasticsearch | localhost:9202 |
| MinIO | localhost:9010 (API) / localhost:9011 (console) |
| MailHog | http://localhost:8026 |

---

## Making a Pull Request

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/my-feature   # new feature
   git checkout -b fix/issue-123     # bug fix
   git checkout -b docs/update-readme
   ```

2. **Make your changes.** Keep each PR focused on a single concern — large PRs are hard to review and slow to merge.

3. **Write or update tests** for any code you add or change.

4. **Run the test suite** locally before pushing (see [Running Tests](#running-tests)).

5. **Push and open a PR** against the `main` branch.
   - Fill in the PR template completely.
   - Link the related issue (e.g. `Closes #42`).
   - Add screenshots or a short screen recording for UI changes.

6. A maintainer will review within 2–3 business days. Please be patient — we're a small team.

### PR Checklist

- [ ] Tests pass (`npm test` in each affected service)
- [ ] TypeScript compiles with no errors (`npm run build`)
- [ ] No new ESLint warnings
- [ ] New database columns / tables have a TypeORM migration
- [ ] Public API changes are reflected in the Swagger docs
- [ ] Environment variable additions are documented in `.env.example`

---

## Coding Standards

### TypeScript

- **Strict mode** is enabled — no `any` without a comment explaining why
- Use `interface` for object shapes, `type` for unions/aliases
- Prefer `async/await` over `.then()` chains
- All exported functions must have JSDoc comments

### NestJS (API)

- One module per feature domain (matches `src/modules/` structure)
- Business logic lives in services, not controllers
- Use DTOs with `class-validator` for all request payloads
- Guard all routes — use `@Public()` only for intentionally unauthenticated endpoints
- Every response goes through `TransformInterceptor` (returns `{ data: ... }`)

### React (Web)

- Functional components with hooks only
- Co-locate component styles with the component (Tailwind classes)
- Use TanStack Query for all server state — no manual `useEffect` data fetching
- Zustand for global client state only (auth, UI preferences)

### SQL / Migrations

- **Never** use `synchronize: true` — always write a migration
- Migration filenames: `{timestamp}-{PascalCaseName}.ts`
- Every migration must have a working `down()` method
- Index all foreign keys and high-cardinality filter columns

---

## Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]

[optional footer: Closes #123]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

**Examples:**
```
feat(issues): add bulk status update endpoint
fix(auth): resolve refresh token race condition on concurrent requests
docs(contributing): add migration guidelines
chore(deps): update TypeORM to 0.3.20
```

---

## Database Migrations

Any change to a TypeORM entity **must** be accompanied by a migration.

```bash
cd services/api

# After modifying an entity, generate the migration automatically:
npm run migration:generate src/database/migrations/DescribeYourChange

# Or create a blank migration for manual SQL:
npm run migration:create src/database/migrations/DescribeYourChange

# Apply migrations:
npm run migration:run

# Roll back last migration:
npm run migration:revert
```

**Rules:**
- Never alter an existing migration that has been merged to `main`
- Always test both `up()` and `down()` locally before opening a PR
- Migrations run automatically on API startup (`migrationsRun: true`)

---

## Running Tests

```bash
# API unit + integration tests
cd services/api
npm test              # run once
npm run test:watch    # watch mode
npm run test:cov      # with coverage report

# End-to-end tests
npm run test:e2e
```

Coverage target is **80%+**. New code without tests will not be merged.

---

## Questions?

Open a [Discussion](https://github.com/codeupscale/boardupscale/discussions) — we're happy to help.
