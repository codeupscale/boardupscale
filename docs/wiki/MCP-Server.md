# MCP Server

Boardupscale includes a hosted **Model Context Protocol (MCP)** endpoint. AI tools such as **Claude Code** and **Cursor** can use it to read your tickets and add comments. There is nothing to install: every Boardupscale deployment serves MCP at `https://<your-domain>/api/mcp`.

---

## What You Can Do

- "What's assigned to me right now?"
- "Summarize PROJ-42, including its comments and linked pull requests"
- "Which PRs are still open in the PROJ project?"
- "What's on the board for the current sprint?"
- "Add a comment to PROJ-15: Fixed in PR #123"

---

## Setup

### 1. Create a personal MCP token

1. Sign in to Boardupscale.
2. Go to **Settings → AI / MCP**.
3. Enter a name (for example "Claude Code on laptop"), choose an expiry, then click **Create token**.
4. Copy the token right away. It starts with `bu_mcp_` and is only shown once.

Any organization member can create tokens for themselves. Each token lasts at most one year, and you can revoke it from the same page at any time.

### 2. Connect your AI tool

**Claude Code**

```bash
claude mcp add --transport http boardupscale https://<your-domain>/api/mcp --header "Authorization: Bearer bu_mcp_…"
```

**Cursor** (`~/.cursor/mcp.json`) and other clients configured with JSON:

```json
{
  "mcpServers": {
    "boardupscale": {
      "url": "https://<your-domain>/api/mcp",
      "headers": { "Authorization": "Bearer bu_mcp_…" }
    }
  }
}
```

The **AI / MCP** settings page shows these snippets with your server URL already filled in.

For local development the URL is `http://localhost/api/mcp` through nginx, or `http://localhost:4000/api/mcp` when you call the API directly.

---

## Available Tools

| Tool | Description |
|------|-------------|
| `whoami` | The user and organization the token acts as |
| `list_projects` | Projects you can access |
| `list_my_issues` | Issues assigned to you (unfinished by default) |
| `search_issues` | Search by title/key with type, priority and status filters |
| `get_issue` | Full issue detail: description, subtasks, links, comments, attachments, work logs, linked PRs |
| `list_comments` | All comments on an issue |
| `add_comment` | Post a comment as yourself (plain text) |
| `list_sprints` | Sprints in a project |
| `get_board` | Board columns and their issues |
| `list_pull_requests` | GitHub PRs linked to an issue or a project |

Pull request data comes from the project's GitHub integration: title, state, branch, author and URL. To review a PR's diff, use it together with GitHub's own MCP server.

---

## Security Model

- **Same access as the browser.** A token only reaches projects where you are a member. Org owners and administrators can reach every project. Issues in other projects are reported as "not found".
- **Read access plus comments only.** Tokens cannot create, edit, move or delete issues. Comments also need `comment:create` permission in the project, and every comment made through MCP is recorded in the audit log.
- **Scoped to one organization.** A token belongs to the organization it was created in. Your membership is checked on every request, so removing a user from the organization cuts off their MCP access immediately.
- **MCP only.** MCP tokens are rejected by the REST API, and they cannot be used to create more tokens.
- **Stored as hashes.** Only a SHA-256 hash of each token is stored. Tokens always expire, and you can revoke them at any time.
- **Rate limited** to 120 requests per minute.

---

## Legacy stdio package

`services/mcp` is an older stdio server that calls the REST API with an organization API key. It is superseded by the hosted endpoint above and is no longer maintained.
