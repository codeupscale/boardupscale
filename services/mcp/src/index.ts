#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios, { AxiosInstance } from "axios";
import { z } from "zod";

const API_URL = process.env.BOARDUPSCALE_API_URL ?? "http://localhost:4000/api";
const API_KEY = process.env.BOARDUPSCALE_API_KEY ?? "";

if (!API_KEY) {
  process.stderr.write(
    "Warning: BOARDUPSCALE_API_KEY is not set. Requests will be unauthenticated.\n"
  );
}

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    "x-api-key": API_KEY,
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

// Unwrap the standard { data: ... } envelope
function unwrap(res: { data: unknown }): unknown {
  const d = res.data as Record<string, unknown> | null;
  return d && "data" in d ? d.data : d;
}

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

async function handleError(fn: () => Promise<{ content: { type: "text"; text: string }[] }>) {
  try {
    return await fn();
  } catch (err: unknown) {
    const msg =
      axios.isAxiosError(err)
        ? `API error ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
        : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
  }
}

const server = new McpServer({
  name: "boardupscale",
  version: "1.0.0",
});

// ── Projects ─────────────────────────────────────────────────────────────────

server.tool(
  "list_projects",
  "List all projects you have access to in Boardupscale",
  {},
  () =>
    handleError(async () => {
      const res = await api.get("/projects");
      return text(unwrap(res));
    })
);

server.tool(
  "get_project",
  "Get details of a project by its key (e.g. 'PROJ')",
  { key: z.string().describe("The project key, e.g. 'PROJ'") },
  ({ key }) =>
    handleError(async () => {
      const res = await api.get(`/projects/${key}`);
      return text(unwrap(res));
    })
);

// ── Issues ────────────────────────────────────────────────────────────────────

server.tool(
  "list_issues",
  "List issues in a project with optional filters. Returns paginated results.",
  {
    project: z.string().describe("Project key (e.g. 'PROJ') or project UUID"),
    search: z.string().optional().describe("Full-text search term"),
    priority: z
      .enum(["critical", "high", "medium", "low"])
      .optional()
      .describe("Filter by priority"),
    type: z
      .enum(["epic", "story", "task", "bug", "subtask"])
      .optional()
      .describe("Filter by issue type"),
    statusId: z.string().optional().describe("Filter by status UUID"),
    assigneeId: z.string().optional().describe("Filter by assignee UUID"),
    sprintId: z.string().optional().describe("Filter by sprint UUID"),
    page: z.number().int().min(1).optional().default(1),
    limit: z.number().int().min(1).max(100).optional().default(25),
  },
  (args) =>
    handleError(async () => {
      const { project, ...params } = args;
      const res = await api.get("/issues", {
        params: { projectId: project, ...params },
      });
      return text(unwrap(res));
    })
);

server.tool(
  "get_issue",
  "Get full details of a specific issue by its key (e.g. 'PROJ-42')",
  { key: z.string().describe("Issue key like 'PROJ-42'") },
  ({ key }) =>
    handleError(async () => {
      const res = await api.get(`/issues/${key}`);
      return text(unwrap(res));
    })
);

server.tool(
  "create_issue",
  "Create a new issue in a project",
  {
    projectId: z.string().describe("Project key (e.g. 'PROJ') or project UUID"),
    title: z.string().min(1).describe("Issue title"),
    description: z.string().optional().describe("Issue description (markdown supported)"),
    type: z
      .enum(["epic", "story", "task", "bug", "subtask"])
      .optional()
      .default("task")
      .describe("Issue type (default: task)"),
    priority: z
      .enum(["critical", "high", "medium", "low"])
      .optional()
      .default("medium")
      .describe("Issue priority (default: medium)"),
    assigneeId: z.string().optional().describe("Assignee user UUID"),
    storyPoints: z.number().int().min(0).optional().describe("Story point estimate"),
    dueDate: z.string().optional().describe("Due date in YYYY-MM-DD format"),
    parentId: z.string().optional().describe("Parent issue UUID (for subtasks)"),
  },
  (body) =>
    handleError(async () => {
      const res = await api.post("/issues", body);
      const issue = unwrap(res) as { key: string; title: string };
      return { content: [{ type: "text" as const, text: `Created ${issue.key}: ${issue.title}\n\n${JSON.stringify(issue, null, 2)}` }] };
    })
);

server.tool(
  "update_issue",
  "Update fields on an existing issue",
  {
    key: z.string().describe("Issue key like 'PROJ-42'"),
    title: z.string().optional(),
    description: z.string().optional(),
    priority: z.enum(["critical", "high", "medium", "low"]).optional(),
    statusId: z.string().optional().describe("Target status UUID"),
    assigneeId: z.string().optional().describe("New assignee UUID; pass empty string to unassign"),
    storyPoints: z.number().int().min(0).optional(),
    dueDate: z.string().optional().describe("Due date YYYY-MM-DD; pass empty string to clear"),
  },
  ({ key, ...updates }) =>
    handleError(async () => {
      const body = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined)
      );
      const res = await api.patch(`/issues/${key}`, body);
      return text(unwrap(res));
    })
);

server.tool(
  "delete_issue",
  "Move an issue to the project trash (soft delete, recoverable for 30 days)",
  { key: z.string().describe("Issue key like 'PROJ-42'") },
  ({ key }) =>
    handleError(async () => {
      await api.delete(`/issues/${key}`);
      return { content: [{ type: "text" as const, text: `Issue ${key} moved to trash.` }] };
    })
);

// ── Comments ──────────────────────────────────────────────────────────────────

server.tool(
  "list_comments",
  "List comments on an issue",
  { key: z.string().describe("Issue key like 'PROJ-42'") },
  ({ key }) =>
    handleError(async () => {
      // Get issue first to resolve the UUID
      const issueRes = await api.get(`/issues/${key}`);
      const issue = unwrap(issueRes) as { id: string };
      const res = await api.get(`/issues/${issue.id}/comments`);
      return text(unwrap(res));
    })
);

server.tool(
  "add_comment",
  "Post a comment on an issue",
  {
    key: z.string().describe("Issue key like 'PROJ-42'"),
    content: z.string().min(1).describe("Comment text (markdown supported)"),
  },
  ({ key, content }) =>
    handleError(async () => {
      const issueRes = await api.get(`/issues/${key}`);
      const issue = unwrap(issueRes) as { id: string };
      const res = await api.post(`/issues/${issue.id}/comments`, { content });
      return { content: [{ type: "text" as const, text: `Comment added to ${key}.\n\n${JSON.stringify(unwrap(res), null, 2)}` }] };
    })
);

// ── Sprints ───────────────────────────────────────────────────────────────────

server.tool(
  "list_sprints",
  "List sprints for a project",
  {
    project: z.string().describe("Project key or UUID"),
    status: z
      .enum(["planning", "active", "completed"])
      .optional()
      .describe("Filter by sprint status"),
  },
  ({ project, status }) =>
    handleError(async () => {
      const res = await api.get("/sprints", {
        params: { projectId: project, status },
      });
      return text(unwrap(res));
    })
);

server.tool(
  "create_sprint",
  "Create a new sprint in a project",
  {
    projectId: z.string().describe("Project key or UUID"),
    name: z.string().describe("Sprint name"),
    goal: z.string().optional().describe("Sprint goal"),
    startDate: z.string().optional().describe("Start date YYYY-MM-DD"),
    endDate: z.string().optional().describe("End date YYYY-MM-DD"),
  },
  (body) =>
    handleError(async () => {
      const res = await api.post("/sprints", body);
      return text(unwrap(res));
    })
);

// ── Search ────────────────────────────────────────────────────────────────────

server.tool(
  "search",
  "Full-text search across issues, projects, and pages",
  {
    query: z.string().min(1).describe("Search query"),
    type: z
      .enum(["issue", "project", "page"])
      .optional()
      .describe("Restrict to a specific entity type"),
    limit: z.number().int().min(1).max(50).optional().default(10),
  },
  ({ query, type, limit }) =>
    handleError(async () => {
      const res = await api.get("/search", {
        params: { q: query, type, limit },
      });
      return text(unwrap(res));
    })
);

// ── Users ─────────────────────────────────────────────────────────────────────

server.tool(
  "list_members",
  "List members of the organization (useful for finding assignee IDs)",
  {},
  () =>
    handleError(async () => {
      const res = await api.get("/users");
      return text(unwrap(res));
    })
);

// ── Boards ────────────────────────────────────────────────────────────────────

server.tool(
  "get_board",
  "Get the Kanban board for a project, including all statuses and WIP limits",
  { project: z.string().describe("Project key (e.g. 'PROJ')") },
  ({ project }) =>
    handleError(async () => {
      const res = await api.get(`/projects/${project}/board`);
      return text(unwrap(res));
    })
);

// ── Start server ──────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal MCP server error: ${err}\n`);
  process.exit(1);
});
