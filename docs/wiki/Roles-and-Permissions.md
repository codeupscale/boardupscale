# Roles & Permissions

Boardupscale uses Role-Based Access Control (RBAC) with four built-in roles and support for custom roles.

---

## Built-in Roles

| Role | Typical use |
|------|-------------|
| **Admin** | Organisation owners and senior managers |
| **Manager** | Project leads and team leads |
| **Member** | Developers, designers, and other contributors |
| **Viewer** | Stakeholders and read-only guests |

### Permissions Matrix

| Permission | Admin | Manager | Member | Viewer |
|------------|:-----:|:-------:|:------:|:------:|
| Create / delete projects | ✅ | ✅ | ❌ | ❌ |
| Edit project settings | ✅ | ✅ | ❌ | ❌ |
| Invite members | ✅ | ✅ | ❌ | ❌ |
| Remove members | ✅ | ✅ | ❌ | ❌ |
| Change member roles | ✅ | ❌ | ❌ | ❌ |
| Create issues | ✅ | ✅ | ✅ | ❌ |
| Edit any issue | ✅ | ✅ | ✅ | ❌ |
| Delete issues | ✅ | ✅ | ❌ | ❌ |
| Comment | ✅ | ✅ | ✅ | ❌ |
| View all issues | ✅ | ✅ | ✅ | ✅ |
| Manage board columns | ✅ | ✅ | ❌ | ❌ |
| Start / complete sprints | ✅ | ✅ | ❌ | ❌ |
| Manage automation rules | ✅ | ✅ | ❌ | ❌ |
| Manage webhooks | ✅ | ❌ | ❌ | ❌ |
| View audit log | ✅ | ❌ | ❌ | ❌ |
| Manage API keys | ✅ | ❌ | ❌ | ❌ |
| Configure SAML SSO | ✅ | ❌ | ❌ | ❌ |
| Create / edit pages | ✅ | ✅ | ✅ | ❌ |
| Delete pages | ✅ | ✅ | ❌ | ❌ |
| Log time | ✅ | ✅ | ✅ | ❌ |
| View reports | ✅ | ✅ | ✅ | ✅ |

---

## Custom Roles

Create a custom role with a precise set of permissions.

1. Go to **Organisation Settings → Roles**
2. Click **+ New Role**
3. Give the role a name and description
4. Toggle individual permissions on/off
5. Click **Save**

Assign custom roles to members the same way as built-in roles.

---

## Assigning Roles

### At Organisation Level

1. Go to **Organisation Settings → Members**
2. Click the role badge next to a member's name
3. Select the new role

### At Project Level

Project-level roles override the organisation-level role for that specific project.

1. Go to **Project Settings → Members**
2. Find the member
3. Select their project-specific role

> Example: A user might be a **Viewer** at the org level but a **Member** in one specific project.

---

## Inviting Members

1. Go to **Organisation Settings → Members → Invite**
2. Enter the email address and select a role
3. Click **Send Invite**

The invitee receives an email with a link to set their password and join the organisation. If they already have an account, they're added directly.

---

## Removing Members

1. Go to **Organisation Settings → Members**
2. Click `···` next to the member
3. Select **Remove from organisation**

Removing a member does not delete their issues, comments, or logged time. Their content remains, but they can no longer log in to your organisation.
