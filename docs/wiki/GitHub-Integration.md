# GitHub Integration

Connect Boardupscale to GitHub to link pull requests and commits to issues automatically.

---

## What It Does

- **Link PRs to issues** — mention an issue key in a PR title or description (`PROJ-42`) to create a link automatically
- **Link commits to issues** — reference issue keys in commit messages
- **Auto-transition issues** — automatically move an issue to Done when a linked PR is merged
- **See GitHub activity on issues** — PR status, commit list, and CI checks appear on the issue detail page

---

## Setup — GitHub App

### Step 1 — Create a GitHub App

1. Go to your GitHub organisation → **Settings → Developer settings → GitHub Apps → New GitHub App**
2. Set:
   - **GitHub App name:** `Boardupscale - YourOrg`
   - **Homepage URL:** `https://your-domain`
   - **Webhook URL:** `https://your-domain/api/github/webhook`
   - **Webhook secret:** generate a random string and save it
3. **Permissions** — Repository permissions:
   - Contents: Read
   - Issues: Read
   - Pull requests: Read & Write
   - Commit statuses: Read
4. **Subscribe to events:**
   - Pull request
   - Push
   - Create
5. Click **Create GitHub App**
6. Generate a **private key** — download the `.pem` file
7. Note the **App ID**

### Step 2 — Configure Boardupscale

Add to your `.env`:

```env
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY=BASE64_ENCODED_PRIVATE_KEY
GITHUB_APP_WEBHOOK_SECRET=your-webhook-secret
```

Encode the private key:

```bash
base64 -i your-app.private-key.pem | tr -d '\n'
```

Restart the API container.

### Step 3 — Install the App

1. Go to your GitHub App's settings
2. Click **Install App**
3. Select your organisation (or specific repositories)
4. Click **Install**

### Step 4 — Connect in Boardupscale

1. Go to **Project Settings → GitHub Integration**
2. Click **Connect to GitHub**
3. Select the repository to link
4. Click **Save**

---

## Linking Issues to Pull Requests

Mention an issue key anywhere in the PR title, body, or a commit message:

```
feat: implement user authentication PROJ-42
```

```
fix: resolve login redirect loop

Fixes PROJ-15, PROJ-16
```

Supported keywords (case-insensitive): `fixes`, `closes`, `resolves`, `refs`, `references`

Using `fixes`, `closes`, or `resolves` will **auto-transition** the issue to Done when the PR is merged.

---

## Issue Detail Page — GitHub Panel

On an issue linked to one or more PRs, the GitHub panel shows:

- PR title, number, and status (open / merged / closed)
- PR author and creation date
- CI check status (passing / failing)
- Commits referencing the issue

---

## Auto-Transition on PR Merge

When a PR that references an issue with `fixes PROJ-42` is merged:

1. Boardupscale receives the webhook event
2. The issue transitions to the **Done** status (or the last status in the workflow)
3. A comment is added: "Automatically closed — PR #123 merged by @username"

This can be customised or disabled via [Automation](Automation) rules.

---

## Disconnecting

Go to **Project Settings → GitHub Integration → Disconnect**. Existing issue links remain but no new events will be processed.
