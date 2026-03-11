# MCP Server

Boardupscale ships with a **Model Context Protocol (MCP) server** that lets you interact with your projects using natural language from AI coding tools like **Claude Code** and **Cursor**.

---

## What You Can Do

- "Show me all open bugs assigned to me in the PROJ project"
- "Create a high-priority bug: login page crashes on mobile"
- "Move PROJ-42 to In Progress and assign it to alice@company.com"
- "List all issues in the current sprint"
- "Add a comment to PROJ-15: Fixed in PR #123"

---

## Setup

### 1. Get an API Key

1. Log into Boardupscale
2. Go to **User Settings → API Keys**
3. Click **Generate New Key**
4. Copy the key (shown once)

### 2. Start the MCP Server

```bash
cd services/mcp
cp .env.example .env
# Edit .env and set:
# BOARDUPSCALE_API_URL=http://localhost:4000
# BOARDUPSCALE_API_KEY=bu_your_api_key_here
npm install
npm run build
```

### 3. Configure Claude Code

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "boardupscale": {
      "command": "node",
      "args": ["/path/to/boardupscale/services/mcp/dist/index.js"],
      "env": {
        "BOARDUPSCALE_API_URL": "http://localhost:4000",
        "BOARDUPSCALE_API_KEY": "bu_your_api_key_here"
      }
    }
  }
}
```

Or use npx for zero-install:

```json
{
  "mcpServers": {
    "boardupscale": {
      "command": "npx",
      "args": ["@boardupscale/mcp"],
      "env": {
        "BOARDUPSCALE_API_URL": "https://your-boardupscale-url",
        "BOARDUPSCALE_API_KEY": "bu_your_api_key_here"
      }
    }
  }
}
```

### 4. Configure Cursor

Add to Cursor's MCP settings (`.cursor/mcp.json` in your project):

```json
{
  "mcpServers": {
    "boardupscale": {
      "command": "node",
      "args": ["/path/to/boardupscale/services/mcp/dist/index.js"],
      "env": {
        "BOARDUPSCALE_API_URL": "http://localhost:4000",
        "BOARDUPSCALE_API_KEY": "bu_your_api_key_here"
      }
    }
  }
}
```

---

## Available Tools

The MCP server exposes these tools to the AI:

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects in your organisation |
| `list_issues` | List issues with optional filters |
| `get_issue` | Get full detail for a specific issue by key |
| `create_issue` | Create a new issue |
| `update_issue` | Update fields on an existing issue |
| `add_comment` | Post a comment on an issue |
| `list_sprints` | List sprints for a project |
| `get_current_sprint` | Get the active sprint for a project |
| `search_issues` | Full-text search across issues |
| `list_members` | List organisation members |

---

## Example Usage in Claude Code

```
> Show me all critical bugs in the PROJ project

I'll search for critical bugs in PROJ.

[Uses list_issues with project=PROJ, type=bug, priority=critical]

Found 3 critical bugs:

1. PROJ-7 — Login crashes on mobile Safari (assigned: unassigned)
2. PROJ-12 — Payment gateway timeout on checkout (assigned: alice@company.com, due: Mar 15)
3. PROJ-18 — Email verification link expires too early (assigned: bob@company.com)

Would you like me to take any action on these?
```

```
> Create a task to add dark mode support, assign it to me, set priority high

[Uses create_issue]

Created PROJ-24: "Add dark mode support"
- Type: Task
- Priority: High
- Assignee: You (adnan@company.com)
- Status: To Do

Link: https://your-domain/projects/PROJ/issues/PROJ-24
```

---

## Running as a Standalone Service

For team-wide access, run the MCP server as a persistent service:

```bash
docker compose up mcp -d
```

The MCP server is included in `docker-compose.yml` and listens on port `3100` via SSE (Server-Sent Events transport).
