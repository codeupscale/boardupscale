# Team Page Real-Time Member Updates

**Date:** 2026-04-21
**Status:** Approved

## Problem

The Team page (Settings → Team) displays org members and pending invitations. Member changes — invite sent, member removed/deactivated, role changed, invitation revoked — are currently only visible to the admin who performed the action. Other admins/owners viewing the same page see stale data until they manually refresh. The affected user (invited or removed) also sees no immediate change on their session.

## Solution

Emit a Socket.io org-room event from the backend after every org member mutation. Every connected client in that org invalidates their `['org-members']` React Query cache on receipt, triggering a fresh fetch.

## Architecture

### Backend — `OrganizationsService`

Inject `EventsGateway` into `OrganizationsService`. After each successful write operation, emit:

```ts
this.gateway.emitToOrg(organizationId, 'org:members:changed', {})
```

Operations that emit the event:
- `inviteMember` — new pending invitation appears
- `updateMemberInfo` — display name / avatar change
- `updateMemberRole` — role badge changes
- `deactivateMember` — member disappears from Active list
- `revokeInvitation` — pending invite disappears
- `resendInvitation` — invitation timestamp updates
- `updateMigratedMemberEmail` — Jira placeholder gets email
- `confirmMergeAndInvite` — placeholder merged, invite sent

No payload is sent with the event — clients re-fetch fresh data from the REST endpoint. This avoids serialization complexity and keeps the event schema trivially simple.

### Frontend — `useOrganization.ts`

New hook added to the existing file:

```ts
export function useOrgMembersRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const handler = () => qc.invalidateQueries({ queryKey: ['org-members'] })
    socket.on('org:members:changed', handler)
    return () => { socket.off('org:members:changed', handler) }
  }, [qc])
}
```

### Frontend — `TeamPage.tsx`

Call `useOrgMembersRealtime()` at the top of the component. No other changes to the page.

### Module Wiring

`OrganizationsModule` must import `WebsocketModule` so `EventsGateway` can be injected into `OrganizationsService`. Check for circular dependencies — use `forwardRef` if needed.

## Data Flow

```
Admin A clicks "Invite Member"
  → POST /organizations/invite
  → OrganizationsService.inviteMember()
  → gateway.emitToOrg(orgId, 'org:members:changed', {})
  → Socket.io broadcasts to org:{orgId} room
  → All connected clients in org receive event
  → queryClient.invalidateQueries(['org-members'])
  → GET /organizations/me/members refetch
  → Team page re-renders with updated list
```

## Scope

- Event name: `org:members:changed`
- Affected page: Settings → Team (`TeamPage.tsx`)
- All org members currently connected (any role) receive the invalidation signal
- The actor's own screen also benefits (redundant with existing `onSuccess` invalidation, but harmless)

## Out of Scope

- Optimistic UI updates (not needed — mutations are admin-only and fast)
- Fine-grained diff payloads (invalidate-and-refetch is sufficient)
- Real-time updates on other pages that display member lists (Project Settings Members tab) — separate feature
