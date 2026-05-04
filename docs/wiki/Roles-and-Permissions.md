# Roles & Permissions

Boardupscale uses a granular Role-Based Access Control (RBAC) system with **57 permissions** across **16 resources**. There are 5 organisation-level roles (including Owner), 4 system project roles, and support for unlimited custom roles per organisation.

> **Source of truth:** This document is generated from a live audit of `services/api/src/database/migrations/1741651200001-SeedData.ts` and `services/api/src/modules/permissions/permissions.service.ts`. Last audited: 2026-05-04.

---

## Organisation-Level Roles

| Role | Enum value | Description |
|------|------------|-------------|
| **Owner** | `owner` | Organisation founder. Full access. Cannot have their role changed by anyone except another Owner. |
| **Admin** | `admin` | Full access to all resources and settings. Can change any member's role except the Owner's. |
| **Manager** | `manager` | Manages projects, issues, sprints, members, and automation. Cannot manage org settings, AI config, or revoke API keys. |
| **Member** | `member` | Regular contributor. Can create/update own work items. Cannot delete issues, manage boards/sprints, or manage members. |
| **Viewer** | `viewer` | Read-only access across all resources. |

### Owner vs Admin — the key difference

Both Owner and Admin bypass the permission table entirely and are granted all 57 permissions implicitly. They differ in **role management protection** only:

| Capability | Owner | Admin |
|---|:---:|:---:|
| All 57 permissions | ✅ | ✅ |
| Can change any member's project role | ✅ | ✅ |
| Can change an **Owner's** project role | ✅ | ❌ |
| Can have their own role changed by an Admin | ❌ | ✅ |

---

## Full Permission Matrix (57 permissions)

Actions: **C** = create · **R** = read · **U** = update · **D** = delete · **M** = manage/special

| Resource | Actions | Owner | Admin | Manager | Member | Viewer |
|----------|---------|:-----:|:-----:|:-------:|:------:|:------:|
| **project** | C R U D M | ✅ all | ✅ all | ✅ all | R only | R only |
| **issue** | C R U D assign | ✅ all | ✅ all | ✅ all | C R U | R only |
| **board** | R U M | ✅ all | ✅ all | ✅ all | R only | R only |
| **sprint** | C R U D M | ✅ all | ✅ all | ✅ all | R only | R only |
| **comment** | C R U D | ✅ all | ✅ all | ✅ all | C R U | R only |
| **worklog** | C R U D | ✅ all | ✅ all | ✅ all | C R U | R only |
| **member** | C R U D | ✅ all | ✅ all | ✅ all | R only | R only |
| **page** | C R U D | ✅ all | ✅ all | ✅ all | C R U | R only |
| **organization** | manage | ✅ | ✅ | ❌ | ❌ | ❌ |
| **automation** | C R U D M | ✅ all | ✅ all | ✅ all | R only | R only |
| **webhook** | C R U D M | ✅ all | ✅ all | ✅ all | R only | ❌ |
| **component** | C R U D | ✅ all | ✅ all | ✅ all | C R U | R only |
| **version** | C R U D M | ✅ all | ✅ all | ✅ all | R only | R only |
| **custom-field** | C R U D | ✅ all | ✅ all | ✅ all | R only | R only |
| **api-key** | C R D | ✅ all | ✅ all | C R | R only | ❌ |
| **ai** | read use chat admin | ✅ all | ✅ all | R use chat | use chat | ❌ |

**Total grants: Owner = 57 (bypass) · Admin = 57 (bypass) · Manager = 54 · Member = 24 · Viewer = 15**

Manager excludes: `organization:manage`, `ai:admin`, `api-key:delete`

---

## How Permissions Are Enforced

### Backend — per-request guard

Every protected endpoint is decorated with:

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@RequirePermission('resource', 'action')
```

`RolesGuard` resolution order for each request:

1. If `@Public()` → skip
2. Extract `projectId` from route params/query/body
3. **Fast-path:** if user's org role is `admin` or `owner` → **allow immediately** (no DB permission lookup)
4. Find `ProjectMember` row for (userId, projectId)
5. If member has `role_id` (custom role) → check that role's permissions
6. Else → map legacy `role` string to system role name → check system role's permissions

### Legacy role string mapping

Old `project_members.role` strings are mapped at runtime:

| Legacy string | Maps to system role |
|---|---|
| `owner`, `admin` | Admin |
| `manager` | Manager |
| `member`, `developer` | Member |
| `viewer` | Viewer |

### Frontend — advisory checks

The `useHasPermission(projectId)` hook calls `GET /projects/{projectId}/my-permissions` and returns an array of `{ resource, action }` pairs. Components use `hasPermission('issue', 'delete')` to show/hide UI elements. The backend is always the authoritative enforcement layer.

Org-level UI gating uses `<RoleGuard roles={[UserRole.ADMIN, UserRole.OWNER]}>` which reads `user.role` from the auth store.

---

## Custom Roles

Organisations can create roles with any combination of the 57 permissions. Custom roles are stored in the `roles` table scoped by `organization_id`. System roles (`is_system = true`, `organization_id = NULL`) are global and cannot be modified or deleted.

**Create a custom role:**

1. Go to **Organisation Settings → Roles**
2. Click **+ New Role**
3. Enter a name and description
4. Toggle individual permissions on/off
5. Click **Save**

Assign custom roles to project members via **Project Settings → Members → Change Role**.

---

## Assigning Roles

### At Organisation Level

1. Go to **Organisation Settings → Members**
2. Click the role badge next to a member's name
3. Select the new role

### At Project Level

Project-level roles (or custom `role_id` assignments) are independent of the org-level role and apply only within that project.

1. Go to **Project Settings → Members**
2. Find the member
3. Select their project-specific role or custom role

> A user can be a **Viewer** at the org level but have a **Manager** custom role in a specific project. Org Admins and Owners always have full access regardless of project-level role.

---

## Inviting Members

1. Go to **Organisation Settings → Members → Invite**
2. Enter the email address and select a role
3. Click **Send Invite**

The invitee receives an email with a link to set their password and join the organisation. If they already have an account, they are added directly.

---

## Removing Members

1. Go to **Organisation Settings → Members**
2. Click `···` next to the member
3. Select **Remove from organisation**

Removing a member does not delete their issues, comments, or logged time. Their content remains but they can no longer access the organisation.

> **Owner protection:** An Owner cannot be removed by an Admin. Only another Owner can remove or downgrade an Owner's role.
