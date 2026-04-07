# Boardupscale — AI / agent context

## Cursor

- **Rules**: `.cursor/rules/*.mdc` — always-on **senior bar** + **agents/skills map**; path-scoped rules for `services/api`, `services/web`, `services/worker`.
- **Master delivery (full lifecycle in Cursor)**: `.cursor/skills/boardupscale-master-delivery/SKILL.md` — use for audits, migration/import analysis, or “findings → fix → test → approve” flows; complements `.claude/agents/master.md` + `pipeline.md`.
- **MCP**: `.cursor/mcp.json` (local tooling; do not commit secrets).

## Claude Code agents (role playbooks)

Authoritative prompts live in **`.claude/agents/*.md`**. In Cursor, cite a file when you want that role (e.g. “follow `backend.md`”).

Orchestration: **`CLAUDE.md`** (pipelines, gates, agent roster).

## Skills

**`.claude/skills/master/SKILL.md`**, **`pipeline/SKILL.md`**, **`mcp-jira/SKILL.md`** — short delegation hints; full behavior is in matching **`agents/*.md`**.

## Jira + MCP

- Agent: **`.claude/agents/mcp-jira.md`**
- Cursor rule: **`.cursor/rules/mcp-jira-expert.mdc`**

## Repo truth

- **Product / features**: `Boardupscale_SRS.md`
- **Stack & ports**: `CLAUDE.md`
