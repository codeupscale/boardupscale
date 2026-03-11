# Scrum & Kanban Boards

Boards give your team a visual, real-time view of work in progress.

---

## Board Types

### Scrum Board
- Work is organised into **sprints** (fixed time-boxes, usually 1–2 weeks)
- Issues move through columns representing workflow statuses
- Paired with a **Backlog** for sprint planning
- Best for: teams with regular cadence and planning ceremonies

### Kanban Board
- Continuous flow — no sprints
- Focus on limiting **Work In Progress (WIP)** to prevent bottlenecks
- Best for: support queues, ops teams, or continuous delivery

---

## Board Layout

```
| To Do          | In Progress     | In Review       | Done           |
|----------------|-----------------|-----------------|----------------|
| PROJ-12        | PROJ-8          | PROJ-3          | PROJ-1         |
| PROJ-15        | PROJ-11         |                 | PROJ-2         |
| PROJ-20        |                 |                 |                |
```

Each column maps to one or more **workflow statuses** configured in Project Settings.

---

## Drag and Drop

- Drag an issue card **horizontally** to change its status
- Drag **vertically** within a column to reorder
- Drop into a different swimlane to change the grouping field (e.g. assignee)

All moves are saved instantly and broadcast to all team members in real-time.

---

## WIP Limits

Set a maximum number of issues allowed in a column to enforce flow and prevent overloading.

**To set a WIP limit:**
1. Go to **Board Settings**
2. Click on a column
3. Enter a **Max issues** value

When a column exceeds its WIP limit, the column header turns **red** as a visual alert. The board does not block you from adding more — it just signals the team to clear the queue first.

---

## Swimlanes

Swimlanes group issues horizontally by a shared attribute, making it easy to see work per assignee, epic, or priority at a glance.

**Available swimlane groupings:**
- **Assignee** — one row per team member + unassigned
- **Epic** — one row per epic + no epic
- **Priority** — one row per priority level
- **None** — flat board (default)

Change swimlanes from the **Group By** dropdown in the board toolbar.

---

## Quick Filters

Filter the board to show only relevant cards without changing the underlying data.

| Filter | Description |
|--------|-------------|
| **My Issues** | Only issues assigned to you |
| **Unassigned** | Issues with no assignee |
| **By label** | Issues with a specific label |
| **By priority** | Issues at a specific priority level |
| **Recently updated** | Issues changed in the last 24 hours |

Multiple filters can be active at once.

---

## Issue Cards

Each card shows:
- Issue key and title
- Assignee avatar
- Priority icon
- Story point estimate (if set)
- Label chips
- Due date (red if overdue)

Click a card to open the full issue detail in a side panel.

---

## Board Settings

Go to **Project → Board Settings** to configure:

- **Columns** — add, rename, reorder, or remove columns
- **Column → status mapping** — which statuses map to each column
- **WIP limits** per column
- **Card layout** — which fields are visible on cards

> Only Admins and Managers can change board settings.

---

## Real-time Updates

All board changes are broadcast instantly via WebSocket. When a teammate moves an issue, you see it move on your screen without refreshing. A small toast notification appears for moves made by others.
