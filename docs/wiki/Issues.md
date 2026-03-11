# Issues

Issues are the core unit of work in Boardupscale. Every piece of work — from a large feature to a one-line bug fix — is tracked as an issue.

---

## Issue Hierarchy

```
Epic
└── Story
    └── Task / Bug
        └── Subtask
```

| Type | Description |
|------|-------------|
| **Epic** | Large body of work spanning multiple sprints |
| **Story** | User-facing feature or requirement |
| **Task** | Technical work item |
| **Bug** | Defect or broken behaviour |
| **Subtask** | Small piece of work within a Task or Story |

---

## Issue Key

Every issue gets a unique key based on the project key:

```
PROJ-1    ← project key + sequential number
PROJ-42
```

The key is permanent and never changes, even if the issue is moved between sprints.

---

## Fields

### Core Fields

| Field | Description |
|-------|-------------|
| **Title** | Short summary of the issue (required) |
| **Description** | Rich text — headings, code blocks, lists, images |
| **Type** | Epic, Story, Task, Bug, Subtask |
| **Status** | Current state in the workflow (e.g. To Do → In Progress → Done) |
| **Priority** | Critical, High, Medium, Low |
| **Assignee** | The team member responsible |
| **Reporter** | Who created the issue (auto-set) |
| **Labels** | Free-text tags for categorisation |
| **Sprint** | Which sprint this issue belongs to (or Backlog) |
| **Epic Link** | Parent epic |
| **Story Points** | Effort estimate for sprint planning |
| **Due Date** | Deadline for this issue |
| **Original Estimate** | Time estimate in hours/minutes |

### Custom Fields

Admins and Managers can add custom fields per project:

- **Text** — free text
- **Number** — integer or decimal
- **Date** — date picker
- **Dropdown** — single-select from a list of options
- **Checkbox** — boolean toggle
- **URL** — clickable link

Go to **Project Settings → Custom Fields** to manage them.

---

## Creating an Issue

1. Click **+ Create Issue** from the top nav or any board column
2. Select the **project** and **issue type**
3. Fill in the title (required) and other fields
4. Click **Create**

**Keyboard shortcut:** Press `C` anywhere on the board to open the create dialog.

---

## Issue Detail Page

Click any issue key or title to open the full detail view.

### Left Panel — Main Content
- Title (editable inline)
- Description (rich text editor — click to edit)
- Sub-tasks list
- Issue links (blocks / is blocked by / duplicates / relates to)
- Activity stream (comments + history)
- Comment box with @mentions and file attachments

### Right Panel — Metadata
- Status transition buttons
- All field values (assignee, priority, labels, sprint, due date, etc.)
- Time tracking: log time + progress bar
- Watchers
- Created / updated timestamps

---

## Comments & Activity

- Type a comment in the text area at the bottom of an issue
- Use **@username** to mention a team member (they'll get notified)
- Attach files by dragging and dropping onto the comment box
- The activity stream shows comments interleaved with field-change history

---

## Issue Linking

Link issues to express relationships:

| Link Type | Meaning |
|-----------|---------|
| **Blocks** | This issue must be resolved first |
| **Is blocked by** | Another issue must be resolved first |
| **Duplicates** | Same problem as another issue |
| **Relates to** | General association |

---

## Bulk Operations

Select multiple issues in the backlog or issue list using the checkbox, then:

- Change **status** for all selected
- Change **assignee** for all selected
- Change **priority** for all selected
- Add **label** to all selected

---

## Moving Issues

- **Between sprints:** Drag from the backlog into a sprint, or use the issue's Sprint field
- **Between statuses:** Drag on the board, or click the status button in the detail view
- **Between projects:** Use the **Move Issue** option in the issue's `···` menu

---

## Deleting & Restoring Issues

Issues are **soft-deleted** — they move to the project's Trash and are recoverable for 30 days.

Go to **Project → Trash** to restore or permanently delete an issue.
