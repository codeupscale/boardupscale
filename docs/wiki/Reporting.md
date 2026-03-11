# Reporting

Boardupscale includes a full suite of agile and project reports. All reports are available under **Project → Reports**.

---

## Available Reports

### Burndown Chart
Tracks story points (or issue count) remaining day-by-day against an ideal burn line.

- **X axis:** Days in the sprint
- **Y axis:** Story points remaining
- **Ideal line:** Straight line from total points on day 0 to 0 on the last day
- **Actual line:** Real progress — goes down as issues are completed
- **Scope line:** Tracks if new issues were added mid-sprint

Use this to spot if a sprint is on track or at risk early.

---

### Burnup Chart
Shows completed work accumulating over time (opposite perspective to burndown).

- **Total scope line:** Rises when issues are added to the sprint
- **Completed line:** Rises as issues are marked Done
- The gap between the two lines shows remaining work

Better than burndown for visualising scope creep.

---

### Velocity Chart
Shows how many story points the team completed per sprint over the last 7 sprints.

- Helps teams set realistic sprint goals based on historical capacity
- Shows committed vs. completed points per sprint
- Trend line highlights improvement or decline

---

### Cycle Time Chart
Shows how long individual issues take from "In Progress" to "Done".

- Each dot is one issue; hover for details
- Rolling average line shows trend
- Outliers (large dots above the average) indicate blockers
- Filter by issue type, assignee, or label

Use cycle time to identify process bottlenecks.

---

### Created vs. Resolved Chart
Compares the rate of issue creation to the rate of resolution over time.

- If **created > resolved**, your backlog is growing
- If **resolved > created**, you're paying down backlog debt
- Date range selector for any period

---

### Workload Chart
Shows how many open issues are assigned to each team member.

- Bar chart per assignee showing issue count by status
- Quickly spot overloaded team members
- Filter by priority to focus on critical work

---

### Sprint Report
A summary generated after a sprint is completed.

| Section | Content |
|---------|---------|
| Completed issues | Issues that reached Done before sprint end |
| Incomplete issues | Issues that were in the sprint but not finished |
| Added mid-sprint | Issues added after sprint started (scope creep) |
| Removed mid-sprint | Issues removed during the sprint |

---

### Timesheet Report
Shows time logged by team members.

- Weekly grid: each row is a user, each column is a day
- Shows hours logged per issue per day
- Total hours per user per week
- Export to CSV for billing or payroll

---

## Filters & Date Ranges

All reports support filtering by:
- Sprint (specific sprint or date range)
- Team member
- Issue type
- Label
- Date range

---

## Exporting Data

Reports can be exported as **CSV** from the report toolbar. The CSV contains the raw data used to generate the chart, suitable for analysis in Excel, Google Sheets, or any BI tool.

---

## Dashboard

The personal **Dashboard** (home page after login) shows:

- Open issues assigned to you
- In-progress issues count
- Total completed issues
- Recent projects
- Sprint intelligence widget — predicted completion % for active sprint
