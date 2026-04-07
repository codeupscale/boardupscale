---
name: boardupscale-master-delivery
description: |
  Boardupscale end-to-end delivery orchestrator for Cursor. Use when the user wants a
  full lifecycle from analysis to approved ship: complex audits (e.g. Jira migration sync,
  org isolation), multi-step features, investigations with findings → fixes → tests → review.
  Trigger phrases: "run master flow", "full pipeline", "end-to-end", "from findings to
  implementation", "audit and fix", "analyze migration/import flow", "assign the right agent".
---

# Boardupscale Master Delivery (Cursor)

You are running the **Master + Pipeline** lifecycle **inside Cursor**. There are no `/master` or `/pipeline` slash commands here. You implement this playbook yourself: plan like `.claude/agents/master.md`, execute like `.claude/agents/pipeline.md`, and enforce gates from `CLAUDE.md`.

## When this skill applies

- Open-ended analysis plus implementation (e.g. “analyze Jira migration flow, org scoping, data completeness, gaps, fixes”).
- Requests for “master”, “pipeline”, “full flow”, “findings → solutions → code → tests → approved”.
- Cross-cutting work touching API + worker + DB + tests.

If the user only wants a **one-line bugfix**, use a minimal path (see § Short path) instead of the full orchestrator.

---

## Phase 0 — Intake

1. Restate the goal and **definition of done** in your own words.
2. List **explicit out-of-scope** items to prevent creep.
3. Identify **constraints**: tenant isolation (`organizationId`), secrets, migrations, existing import pipelines.

---

## Phase 1 — Classify and route (Pipeline Step 0)

Classify the work:

| Kind | Typical flow |
|------|----------------|
| `audit` / `investigation` | product (if PM parity) → architect → **read code paths** → security → reviewer-style summary |
| `bugfix` | backend and/or frontend → qa → security (if auth/data) → reviewer |
| `schema` | database → migration (GATE) → backend → qa → reviewer |
| `feature` | product → architect → database → migration (GATE) → backend → worker* → frontend* → gates |
| `jira-import / migration-sync` | **mcp-jira** (`.claude/agents/mcp-jira.md`) + import API/worker code + tenant tests |

Read the matching agent file(s) from `.claude/agents/` **before** writing code. Specialist map:

| Topic | Agent file |
|-------|------------|
| Strategy, sequencing, multi-task plans | `master.md` |
| Single-task execution + gate order | `pipeline.md` |
| Jira MCP, REST bulk, import persistence | `mcp-jira.md` |
| Nest API, guards, DTOs | `backend.md` |
| Postgres, schema | `database.md` |
| Migrations safety | `migration.md` |
| BullMQ | `worker.md` |
| React/web | `frontend.md` |
| Tenant / permissions | `rbac.md`, `security.md` |
| Tests | `qa.md` |
| Ship/no-ship | `reviewer.md` |

---

## Phase 2 — Discovery (audit tasks)

For “how does X work / is org flow correct / is data complete”:

1. **Trace flows**: HTTP/import entry → services → queues → workers → DB writes → search index if any.
2. **Tenant check**: every query and write path must be scoped by `organizationId` (or equivalent); flag any bypass.
3. **Idempotency / retries**: jobs must be safe to retry; mapping tables consistent.
4. **Gaps**: compare to `Boardupscale_SRS.md` and product expectations (Jira-class parity hints in `product.md`).
5. Output a **Findings** section: severity (P0–P3), evidence (file paths), repro or query notes.

Use **MCP** only as discovery aids (e.g. Atlassian MCP for Jira shape); **persist data** via documented import APIs/scripts per `mcp-jira.md`, not ad-hoc bulk SQL in prod paths.

---

## Phase 3 — Master plan (before big implementation)

Produce a short plan (can mirror `master.md`):

- **Done** criteria
- **In / out** of scope
- **Risks** and mitigations
- **Task breakdown** with dependencies
- Which **gates** apply (migration / qa / security / reviewer)

---

## Phase 4 — Execute (Pipeline)

1. Implement in **small, reviewable steps**; match existing module patterns in `services/api`, `services/worker`, `services/web`.
2. After schema changes: migration with safe `up`/`down`, tenant columns where required.
3. Add or extend **tests** (tenant isolation for new org-scoped behavior when applicable).

---

## Phase 5 — Gates (mental or explicit)

Apply gates from `CLAUDE.md` that fit the change:

| Gate | Question |
|------|----------|
| Migration | Safe rollback, indexes, nullable strategy, `organizationId` where needed |
| QA | Tests pass; new paths covered; no obvious regressions |
| Security | No tenant leak; auth on mutating routes; validated input |
| Reviewer | Would you approve this PR? Summarize risks |

Loop **fix → re-verify** until gates pass or the user accepts a documented exception.

---

## Phase 6 — Handoff and approval

1. **Summary**: what changed, where, how it satisfies “done”.
2. **Verification**: commands run (e.g. targeted test command), manual checks if any.
3. **Residual risks** / follow-ups.

---

## Jira migration / sync — focused checklist

Use this subsection when the task mentions Jira import, migration, or sync:

1. Read `.claude/agents/mcp-jira.md` and follow persistence via **import pipeline** (`scripts/jira_cloud_import.py`, `/api/import/jira/*`, worker), not raw SQL for domain data.
2. Trace **organization** resolution: how org is chosen for an import job; confirm no cross-tenant writes.
3. Map **entity coverage**: projects, issues, users, statuses, sprints, attachments, etc. — compare to what the importer implements.
4. Check **worker** queues: failure handling, retries, dead-letter behavior.
5. Propose **fixes** as concrete tasks (code + tests), then run Phase 4–6.

---

## Short path (skip full orchestrator)

- **Tiny bugfix** in one file: fix → run relevant tests → brief summary.
- **Docs-only**: edit → sanity check.

---

## Relationship to repo artifacts

- **Authoritative long prompts**: `.claude/agents/*.md`
- **Short hints**: `.claude/skills/*/SKILL.md`
- **Cursor rules**: `.cursor/rules/*.mdc` (always-on or scoped)
- **This skill**: tells you **how to sequence** work in Cursor; it does not replace security or tenant rules.

If the request is too large for one session, split work: complete Phase 2–3 and leave a written **Next steps** list with file pointers for the follow-up chat.
