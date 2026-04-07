#!/usr/bin/env bash
# ============================================================
# Boardupscale — Cursor QA Agent Trigger
# Runs automatically via Claude Code Stop hook.
# Hands off to Cursor agent with full project context.
# Output: /tmp/boardupscale-qa.log
# ============================================================

set -euo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

PROJECT_ROOT="/Users/muhammadjamil/Desktop/projects/boardupscale"
API_DIR="$PROJECT_ROOT/services/api"
LOG_FILE="/tmp/boardupscale-qa.log"

command -v agent &>/dev/null || { echo "[QA] Cursor agent not installed — skipping" >> "$LOG_FILE"; exit 0; }

# ── Gather git context ─────────────────────────────────────────────────────
cd "$PROJECT_ROOT"
CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(ts|js)$' | head -20 || echo "no git changes detected")
CHANGED_SUMMARY=$(git diff --stat HEAD 2>/dev/null | tail -1 || echo "clean working tree")

echo "" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"
echo "[QA] $(date '+%Y-%m-%d %H:%M:%S') — Cursor QA triggered" >> "$LOG_FILE"
echo "[QA] $CHANGED_SUMMARY" >> "$LOG_FILE"
echo "[QA] Changed files: $CHANGED_FILES" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"

# ── Notify: QA starting ────────────────────────────────────────────────────
osascript -e 'display notification "Running tests + fixing issues..." with title "boardupscale QA" subtitle "Cursor agent started"' 2>/dev/null || true

# ── Build the prompt ───────────────────────────────────────────────────────
PROMPT=$(cat <<'PROMPT_EOF'
You are a Senior QA Engineer for **boardupscale** — a multi-tenant project management SaaS.
Claude just finished a development task. Run tests, fix failures, validate fixes are correct.

## Project Structure
- Root: /Users/muhammadjamil/Desktop/projects/boardupscale
- Backend: services/api (NestJS 10 + TypeORM + PostgreSQL + BullMQ + Redis)
- Frontend: services/web (Vite + React + TanStack Query)
- Worker: services/worker (BullMQ job processor — Jira import, migrations)
- MCP: services/mcp (Model Context Protocol server)

## Test Infrastructure — services/api

### Commands
- Unit tests:  cd services/api && node node_modules/.bin/jest --passWithNoTests --bail
- With output: cd services/api && node node_modules/.bin/jest --passWithNoTests --bail --verbose 2>&1
- TypeScript:  cd services/api && node node_modules/.bin/tsc --noEmit
- ESLint:      cd services/api && node node_modules/.bin/eslint src/**/*.ts --format compact

### Shared test utilities — ALWAYS use these
- src/test/test-utils.ts
    createMockRepository()           — TypeORM repository mock (all methods)
    createMockQueryBuilder(result?)  — chained query builder mock
    createMockProjectsService()      — ProjectsService mock
    createMockNotificationsService() — NotificationsService mock
    createMockEventsGateway()        — WebSocket gateway mock
    createMockConfigService()        — ConfigService mock
    mockUpdateResult(affected?)      — TypeORM UpdateResult

- src/test/mock-factories.ts
    mockUser(overrides?)             — User entity
    mockOrganization(overrides?)     — Organization entity
    mockProject(overrides?)          — Project entity
    mockIssue(overrides?)            — Issue entity
    mockIssueStatus(overrides?)      — IssueStatus entity
    mockSprint(overrides?)           — Sprint entity
    mockComment(overrides?)          — Comment entity
    TEST_IDS                         — fixed UUIDs: ORG_ID, USER_ID, PROJECT_ID, ISSUE_ID, STATUS_ID, SPRINT_ID

### All 20 spec files
src/common/filters/http-exception.filter.spec.ts
src/common/interceptors/transform.interceptor.spec.ts
src/common/guards/jwt-auth.guard.spec.ts
src/common/guards/roles.guard.spec.ts
src/modules/auth/auth.service.spec.ts
src/modules/auth/auth.controller.spec.ts
src/modules/auth/password-policy.service.spec.ts
src/modules/boards/boards.service.spec.ts
src/modules/comments/comments.service.spec.ts
src/modules/files/files.service.spec.ts
src/modules/issues/issues.service.spec.ts
src/modules/issues/issues.controller.spec.ts
src/modules/migration/migration.service.spec.ts
src/modules/notifications/notifications.service.spec.ts
src/modules/organizations/organizations.service.spec.ts
src/modules/projects/projects.controller.spec.ts
src/modules/projects/projects.service.spec.ts
src/modules/search/search.service.spec.ts
src/modules/sprints/sprints.service.spec.ts
src/modules/users/users.service.spec.ts

## QA Steps — Execute in strict order

### Step 1: Run unit tests
```bash
cd /Users/muhammadjamil/Desktop/projects/boardupscale/services/api
node node_modules/.bin/jest --passWithNoTests --bail 2>&1
```

### Step 2: If tests fail — diagnose
For each FAIL block:
1. Read the full error message (expected vs received)
2. Read the spec file to understand what behaviour is expected
3. Read the source file the spec covers
4. Determine: is the source code wrong, or is the spec outdated?
   - Source wrong (most common): new logic broke existing behaviour → fix source
   - Spec wrong (rare): spec tests implementation detail that changed intentionally → update spec
5. Never weaken an assertion to make a test pass (e.g. changing `toBe('x')` to `toBeDefined()`)

### Step 3: Fix and re-run
Apply fixes then re-run:
```bash
node node_modules/.bin/jest --passWithNoTests --bail 2>&1
```
Repeat until all tests pass. Maximum 3 fix attempts — if still failing after 3, report as BLOCKED.

### Step 4: Check for missing coverage on changed files
For each changed .ts file in services/api/src/modules/:
- Find its spec file (same path, .spec.ts)
- If a new public method exists in source but has no test case in the spec → add one
- Use the existing test patterns in that spec file (never invent new patterns)

### Step 5: TypeScript check
```bash
cd /Users/muhammadjamil/Desktop/projects/boardupscale/services/api
node node_modules/.bin/tsc --noEmit 2>&1
```
Fix any NEW errors introduced by Claude (ignore pre-existing errors in untouched files).

### Step 6: Validate your own fixes
Before finishing, review every file you modified:
- Did you actually fix the root cause or just suppress the symptom?
- Did you add any `as any` casts or `@ts-ignore` to bypass type errors? → Remove them, fix properly
- Did you weaken any test assertion? → Revert and fix the source instead

## Critical Rules (Non-Negotiable)
1. **Multi-tenancy**: Every DB query in modules must filter by `organizationId`. If you see a missing org filter → report as CRITICAL BUG, do not auto-fix (escalate to human)
2. **Auth**: Never touch JwtAuthGuard, RolesGuard, or the JWT strategy logic without flagging it
3. **No silent promise drops**: `no-floating-promises` errors in auth/issues/projects are real bugs → add `await` or `void` with comment
4. **Test data isolation**: Use TEST_IDS from mock-factories, never hardcode UUIDs in tests
5. **Pagination contract**: All list endpoints return `{ data: { items, total, page, limit } }` — if a new endpoint breaks this, flag it

## Report Format (required)
At the end output exactly this block:

```
QA REPORT — boardupscale
========================
Status: PASS | FAIL | BLOCKED
Tests run: X suites / Y tests
Passed: Y
Failed: X

Changed files reviewed:
- path/to/file.ts (what Claude changed)

Fixes applied:
- file.ts line N: [root cause] → [fix applied]

Assertions validated (confirm fixes are correct):
- test name: expected X, now returns X ✓

Missing coverage added:
- spec file: test case added for methodName()

TypeScript errors fixed: X new errors → 0
TypeScript errors ignored (pre-existing): X

CRITICAL issues (human review needed):
- [any multi-tenancy bypass, auth gap, or promise leak]

WARNINGS (non-blocking):
- [floating promises in untouched files, any casts, etc.]
```
PROMPT_EOF
)

# Append changed files to prompt
PROMPT="$PROMPT

## What Claude changed this session
$CHANGED_SUMMARY
Changed files:
$CHANGED_FILES"

# ── Run Cursor agent ───────────────────────────────────────────────────────
cd "$PROJECT_ROOT"
agent chat --yolo "$PROMPT" >> "$LOG_FILE" 2>&1
QA_EXIT=$?

# ── Parse result for notification ─────────────────────────────────────────
STATUS=$(grep -E "^Status:" "$LOG_FILE" | tail -1 | sed 's/Status: //' || echo "Unknown")
TESTS=$(grep -E "^Tests run:" "$LOG_FILE" | tail -1 || echo "")
FIXES=$(grep -c "^- .*→" "$LOG_FILE" 2>/dev/null || echo "0")

if [[ "$STATUS" == *"PASS"* ]]; then
  ICON="✅"
  SUBTITLE="$TESTS"
elif [[ "$STATUS" == *"BLOCKED"* ]]; then
  ICON="🚧"
  SUBTITLE="Needs human review — check log"
else
  ICON="❌"
  SUBTITLE="$TESTS — $FIXES fixes applied"
fi

echo "[QA] Finished — Status: $STATUS" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"

# ── macOS notification ─────────────────────────────────────────────────────
osascript -e "display notification \"$SUBTITLE\" with title \"boardupscale QA $ICON\" subtitle \"$STATUS\" sound name \"Glass\"" 2>/dev/null || true

exit 0
