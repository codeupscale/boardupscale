# Automation

Automation rules let you eliminate repetitive manual work by triggering actions automatically when certain conditions are met.

---

## How It Works

```
Trigger → (optional) Conditions → Actions
```

Every automation rule has:
1. **One trigger** — the event that starts the rule
2. **Zero or more conditions** — filters to narrow when the rule runs
3. **One or more actions** — what happens when the rule fires

---

## Triggers

| Trigger | Fires when… |
|---------|-------------|
| **Issue Created** | A new issue is created in the project |
| **Issue Status Changed** | An issue transitions to a new status |
| **Issue Assigned** | An issue is assigned (or reassigned) |
| **Issue Priority Changed** | An issue's priority is updated |
| **Comment Added** | A comment is posted on an issue |
| **Sprint Started** | An active sprint begins |
| **Sprint Completed** | An active sprint ends |
| **PR Merged** | A linked GitHub pull request is merged |
| **Due Date Approaching** | An issue's due date is within N days |

---

## Conditions

Conditions let you narrow which issues the rule applies to.

| Condition | Examples |
|-----------|---------|
| **Issue type is** | Bug, Story, Task, Epic |
| **Priority is** | Critical, High, Medium, Low |
| **Status is** | To Do, In Progress, Done |
| **Assignee is** | A specific user or "Unassigned" |
| **Label contains** | `security`, `customer-reported` |
| **Reporter is** | A specific user |
| **Sprint is** | Active sprint, specific sprint name |

Combine multiple conditions with **AND** logic.

---

## Actions

| Action | Description |
|--------|-------------|
| **Assign to user** | Set the assignee to a specific person or the reporter |
| **Set priority** | Change the priority to a fixed value |
| **Set status** | Transition the issue to a specific status |
| **Add label** | Append a label to the issue |
| **Remove label** | Remove a specific label |
| **Add comment** | Post an automated comment (supports `{{issue.key}}`, `{{user.name}}` variables) |
| **Move to sprint** | Move the issue to the active sprint or backlog |
| **Set due date** | Set the due date to today + N days |
| **Send webhook** | POST a JSON payload to an external URL |
| **Send notification** | Send an in-app notification to specific users or roles |

---

## Example Rules

### Auto-assign bugs to the on-call engineer

```
Trigger:    Issue Created
Condition:  Issue type is Bug
Action:     Assign to [on-call engineer]
```

### Move issues to Done when a PR is merged

```
Trigger:    PR Merged
Condition:  Issue status is In Review
Action:     Set status → Done
Action:     Add comment → "Automatically closed — PR merged by {{user.name}}"
```

### Alert team on critical issues

```
Trigger:    Issue Created
Condition:  Priority is Critical
Action:     Send notification → all Managers
Action:     Add label → needs-triage
```

### Close stale issues

```
Trigger:    Due Date Approaching (0 days — past due)
Condition:  Status is To Do
Action:     Add comment → "This issue is overdue. Please update the due date or close it."
Action:     Send notification → assignee
```

---

## Managing Rules

1. Go to **Project → Automations**
2. Click **+ New Rule**
3. Choose a trigger, add conditions, add actions
4. Toggle the rule **Active / Inactive**
5. View the **Execution Log** to see every time a rule fired and whether it succeeded

---

## Execution Log

Every automation run is logged:

- Timestamp
- Which rule fired
- Which issue triggered it
- Conditions evaluated (passed / failed)
- Actions taken
- Any errors

Use the execution log to debug rules that aren't firing as expected.

---

## Variables

Use these variables in comment actions:

| Variable | Value |
|----------|-------|
| `{{issue.key}}` | e.g. `PROJ-42` |
| `{{issue.title}}` | Issue title |
| `{{issue.status}}` | Current status name |
| `{{issue.priority}}` | Priority level |
| `{{user.name}}` | Name of the user who triggered the event |
| `{{user.email}}` | Email of the triggering user |
| `{{sprint.name}}` | Current sprint name |
| `{{project.name}}` | Project name |
