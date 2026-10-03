# MCP Server

Boardupscale includes a hosted **Model Context Protocol (MCP)** endpoint. AI tools such as **Claude Code** and **Cursor** can use it to read your tickets, add comments, and (with a write-enabled token) create and edit tickets. There is nothing to install: every Boardupscale deployment serves MCP at `https://<your-domain>/api/mcp`.

---

## What You Can Do

- "What's assigned to me right now?"
- "Summarize PROJ-42, including its comments and linked pull requests"
- "Which PRs are still open in the PROJ project?"
- "What's on the board for the current sprint?"
- "Add a comment to PROJ-15: Fixed in PR #123"
- "Create a bug in PROJ for the login timeout and assign it to me" *(write access)*
- "Move PROJ-42 to In Review and set it to high priority" *(write access)*

---

## Setup

### 1. Create a personal MCP token

1. Sign in to Boardupscale.
2. Go to **Settings → AI / MCP**.
3. Enter a name (for example "Claude Code on laptop") and choose an expiry.
4. Optionally turn on **Allow creating & editing tickets** to give the token write access.
5. Click **Create token**.
6. Copy the token right away. It starts with `bu_mcp_` and is only shown once.

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
| `get_project_fields` | Valid statuses, members (for assignee) and open sprints of a project |
| `create_issue` | Create an issue *(write access)* |
| `update_issue` | Edit an issue's fields, including status *(write access)* |

### Writing issues

`create_issue` and `update_issue` need a token created with **Allow creating & editing tickets**, plus `issue:create` / `issue:update` permission in the project — exactly what the browser requires. Values are given by name, not ID:

| Field | Format |
|-------|--------|
| `status` | Status name, e.g. `In Progress` (case-insensitive) |
| `assignee` | Project member's email, or `me` |
| `sprint` | Sprint name or id (completed sprints are rejected) |
| `parent` | Issue key in the same project, e.g. `PROJ-10` |
| `dueDate` | `YYYY-MM-DD` |
| `description` | Plain text; blank lines separate paragraphs. Replaces the existing description |
| `labels` | List of labels; replaces the existing labels |

`update_issue` changes only the fields you pass. Pass `null` to clear `assignee`, `sprint`, `parent`, `storyPoints` or `dueDate`. Issues cannot be deleted or moved to another project through MCP.

Pull request data comes from the project's GitHub integration: title, state, branch, author and URL. To review a PR's diff, use it together with GitHub's own MCP server.

---

## Security Model

- **Same access as the browser.** A token only reaches projects where you are a member. Org owners and administrators can reach every project. Issues in other projects are reported as "not found".
- **Read + comment by default; write is opt-in.** Tokens can only create or edit issues when created with write access (`mcp:write` scope), and then only where your project role grants `issue:create` / `issue:update`. Comments need `comment:create`. Tokens can never delete or move issues. Every comment, issue creation and issue edit made through MCP is recorded in the audit log (`mcp.comment.created`, `mcp.issue.created`, `mcp.issue.updated`).
- **Scoped to one organization.** A token belongs to the organization it was created in. Your membership is checked on every request, so removing a user from the organization cuts off their MCP access immediately.
- **MCP only.** MCP tokens are rejected by the REST API, and they cannot be used to create more tokens.
- **Stored as hashes.** Only a SHA-256 hash of each token is stored. Tokens always expire, and you can revoke them at any time.
- **Rate limited** to 120 requests per minute.

---

## Legacy stdio package

`services/mcp` is an older stdio server that calls the REST API with an organization API key. It is superseded by the hosted endpoint above and is no longer maintained.
