#!/usr/bin/env bash
# boardupscale — script cheatsheet
# Run from anywhere inside the repo:  bash scripts/help.sh

B="\033[1m"
R="\033[0m"
BLU="\033[94m"
CYN="\033[96m"
GRN="\033[92m"
YLW="\033[93m"
MGT="\033[95m"
DIM="\033[2m"

header() { printf "\n${B}${BLU}  %-56s${R}\n" ""; printf "${B}${BLU}  $1${R}\n"; printf "${B}${BLU}  %-56s${R}\n" "──────────────────────────────────────────────────────"; }
cmd()    { printf "  ${GRN}%-42s${R}  ${DIM}%s${R}\n" "$1" "$2"; }
note()   { printf "    ${YLW}↳${R} ${DIM}%s${R}\n" "$1"; }

printf "\n${B}${BLU}╔══════════════════════════════════════════════════════╗${R}"
printf "\n${B}${BLU}║       boardupscale  ·  Scripts Cheatsheet            ║${R}"
printf "\n${B}${BLU}╚══════════════════════════════════════════════════════╝${R}\n"

# ── Dev & DB ──────────────────────────────────────────────────────────────
header "⚙️  Dev & Setup"
cmd "bash scripts/setup.sh"                     "First-time project setup"
cmd "npm run start:dev"                          "Start API in watch mode"
cmd "npm run typecheck"                          "TypeScript check (no emit)"
cmd "npm run lint"                               "ESLint all src + test files"
cmd "npm run lint:fix"                           "ESLint auto-fix"
cmd "npm run format"                             "Prettier format all src files"
cmd "npm run test"                               "Run Jest unit tests"
cmd "npm run test:cov"                           "Jest with coverage report"
cmd "npm run test:e2e"                           "End-to-end tests"

# ── Database / Migrations ─────────────────────────────────────────────────
header "🗄️  Database & Migrations"
cmd "npm run migration:run"                      "Apply all pending migrations"
cmd "npm run migration:revert"                   "Revert last migration"
cmd "npm run migration:show"                     "List migrations + status"
cmd "npm run migration:generate -- src/database/migrations/<Name>" \
                                                 "Generate migration from entity diff"
cmd "npm run migration:create -- src/database/migrations/<Name>"   \
                                                 "Create blank migration file"

# ── Scripts ───────────────────────────────────────────────────────────────
header "📊  Ops Scripts  (run from repo root)"
cmd "python3 scripts/org-stats.py"              "Fetch org stats by owner email"
note "--email owner@example.com   skip the prompt"
note "--export                    dump raw JSON to org-stats-export.json"
note "--db <url>                  override DB connection"

cmd "python3 scripts/git-sync.py"              "Smart branch sync + PR creation"
note "auto-detects branch, recommends rebase/merge, optional gh pr create"

cmd "python3 scripts/jira_cloud_import.py"     "Trigger Jira → Boardupscale API import"
cmd "python3 scripts/jira_migration_orchestrator.py" \
                                               "Full Jira migration pipeline (via BullMQ)"
cmd "python3 scripts/jira_sync_org_members_to_db.py" \
                                               "Sync Jira site members into users table"
cmd "npx ts-node scripts/clear-migration-data.ts" \
                                               "Clear migration data from DB"

# ── Git / PR ──────────────────────────────────────────────────────────────
header "🔀  Git & PRs"
cmd "python3 scripts/git-sync.py"              "Fetch + merge/rebase + optional PR (interactive)"
cmd "gh pr create"                             "Create PR manually via GitHub CLI"
cmd "gh pr list"                               "List open PRs"
cmd "gh pr view"                               "View current branch PR"
cmd "gh pr merge"                              "Merge current branch PR"

# ── Docker ────────────────────────────────────────────────────────────────
header "🐳  Docker"
cmd "docker compose up -d"                     "Start all services"
cmd "docker compose up -d postgres redis"      "Start only DB + cache"
cmd "docker compose down"                      "Stop all services"
cmd "bash scripts/logs.sh"                     "Interactive log viewer — pick any container"
note "bash scripts/logs.sh api           jump straight to a service"
note "bash scripts/logs.sh api -f        follow live output"
note "bash scripts/logs.sh worker --tail=100"
cmd "docker compose logs -f <service>"         "Raw compose log follow"

# ── QA / Automation ───────────────────────────────────────────────────────
header "🤖  QA Automation (hooks — fire automatically)"
printf "  ${DIM}PostToolUse (Write|Edit on *.ts)${R}  ${CYN}→${R}  ${DIM}TypeScript + ESLint check injected into Claude context${R}\n"
printf "  ${DIM}Stop hook${R}                         ${CYN}→${R}  ${DIM}Cursor QA agent runs tests + fixes in background${R}\n"
printf "  ${DIM}pre-commit (Husky)${R}                ${CYN}→${R}  ${DIM}tsc → eslint staged → jest --bail (hard git gate)${R}\n"

printf "\n  ${DIM}Manual trigger:${R}\n"
cmd "bash scripts/cursor-qa.sh"                "Trigger Cursor QA agent manually"
cmd "cat /tmp/boardupscale-qa.log"             "View last QA agent run log"

printf "\n${DIM}  Tip: run this cheatsheet anytime →  ${B}bash scripts/help.sh${R}\n\n"
