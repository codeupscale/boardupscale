# Team Page Real-Time Member Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit a Socket.io event from the backend after every org member mutation so all connected clients on the Team page see changes instantly — no manual refresh needed.

**Architecture:** Inject `EventsGateway` into `OrganizationsService`; call `emitToOrg(orgId, 'org:members:changed', {})` after each write. Frontend hook subscribes to that event and invalidates the `['org-members']` React Query cache.

**Tech Stack:** NestJS 11, Socket.io, React 18, TanStack Query v5

---

### Task 1: Wire EventsModule into OrganizationsModule

**Files:**
- Modify: `services/api/src/modules/organizations/organizations.module.ts`

- [ ] **Step 1: Add EventsModule import**

Replace the file content with:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationMembersService } from './organization-members.service';
import { Organization } from './entities/organization.entity';
import { OrganizationMember } from './entities/organization-member.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { EventsModule } from '../../websocket/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, OrganizationMember, User]),
    NotificationsModule,
    PermissionsModule,
    TelemetryModule,
    EventsModule,
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationMembersService],
  exports: [OrganizationsService, OrganizationMembersService],
})
export class OrganizationsModule {}
```

- [ ] **Step 2: Verify the API compiles**

```bash
cd /home/ubuntu/boardupscale/services/api && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors, `dist/` updated.

- [ ] **Step 3: Commit**

```bash
git add services/api/src/modules/organizations/organizations.module.ts
git commit -m "feat: import EventsModule into OrganizationsModule for real-time events"
```

---

### Task 2: Inject EventsGateway and emit after every org member mutation

**Files:**
- Modify: `services/api/src/modules/organizations/organizations.service.ts`

The mutations are at these approximate lines (verify by searching for `async` before each name):
- `inviteMember` (~line 77)
- `updateMemberInfo` (~line 206)
- `updateMemberRole` (~line 234)
- `deactivateMember` (~line 273)
- `resendInvitation` (~line 316)
- `revokeInvitation` (~line 344)
- `updateMigratedMemberEmail` (~line 386)
- `confirmMergeAndInvite` (~line 683)

- [ ] **Step 1: Add EventsGateway import and inject it**

At the top of `organizations.service.ts`, add the import:

```ts
import { EventsGateway } from '../../websocket/events.gateway';
```

In the constructor, add `private gateway: EventsGateway` as the last parameter:

```ts
constructor(
  @InjectRepository(Organization)
  private organizationRepository: Repository<Organization>,
  @InjectRepository(User)
  private userRepository: Repository<User>,
  @InjectRepository(OrganizationMember)
  private organizationMemberRepository: Repository<OrganizationMember>,
  private emailService: EmailService,
  private auditService: AuditService,
  private configService: ConfigService,
  private dataSource: DataSource,
  private posthogService: PosthogService,
  private gateway: EventsGateway,
) {}
```

- [ ] **Step 2: Add emit helper method at the bottom of the class (before the closing `}`)**

```ts
private notifyOrgMembersChanged(organizationId: string): void {
  this.gateway.emitToOrg(organizationId, 'org:members:changed', {});
}
```

- [ ] **Step 3: Call notifyOrgMembersChanged in inviteMember**

Find the `inviteMember` method. It returns a `User`. Add the call right before the final `return` statement in the method (after the member has been saved/created):

```ts
this.notifyOrgMembersChanged(organizationId);
return user; // or whatever the final return is
```

- [ ] **Step 4: Call notifyOrgMembersChanged in updateMemberInfo**

Find the `updateMemberInfo` method. Add before its final `return`:

```ts
this.notifyOrgMembersChanged(organizationId);
```

- [ ] **Step 5: Call notifyOrgMembersChanged in updateMemberRole**

Find the `updateMemberRole` method. Add before its final `return`:

```ts
this.notifyOrgMembersChanged(organizationId);
```

- [ ] **Step 6: Call notifyOrgMembersChanged in deactivateMember**

Find the `deactivateMember` method. Add before its final `return` (or at end if it returns `void`):

```ts
this.notifyOrgMembersChanged(organizationId);
```

- [ ] **Step 7: Call notifyOrgMembersChanged in resendInvitation**

Find the `resendInvitation` method. Add before its final `return`:

```ts
this.notifyOrgMembersChanged(organizationId);
```

- [ ] **Step 8: Call notifyOrgMembersChanged in revokeInvitation**

Find the `revokeInvitation` method. Add before its final `return`:

```ts
this.notifyOrgMembersChanged(organizationId);
```

- [ ] **Step 9: Call notifyOrgMembersChanged in updateMigratedMemberEmail**

Find the `updateMigratedMemberEmail` method. Add before its final `return`:

```ts
this.notifyOrgMembersChanged(organizationId);
```

- [ ] **Step 10: Call notifyOrgMembersChanged in confirmMergeAndInvite**

Find the `confirmMergeAndInvite` method. Add before its final `return`:

```ts
this.notifyOrgMembersChanged(organizationId);
```

- [ ] **Step 11: Verify the API compiles**

```bash
cd /home/ubuntu/boardupscale/services/api && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 12: Commit**

```bash
git add services/api/src/modules/organizations/organizations.service.ts
git commit -m "feat: emit org:members:changed socket event after every org member mutation"
```

---

### Task 3: Add useOrgMembersRealtime hook on the frontend

**Files:**
- Modify: `services/web/src/hooks/useOrganization.ts`

- [ ] **Step 1: Add import for socket and useEffect**

At the top of `useOrganization.ts`, the file already imports from `@tanstack/react-query`. Add these two imports (if not already present):

```ts
import { useEffect } from 'react'
import { getSocket } from '@/lib/socket'
```

- [ ] **Step 2: Add the hook at the end of the file**

Append this to the bottom of `services/web/src/hooks/useOrganization.ts`:

```ts
export function useOrgMembersRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const handler = () => qc.invalidateQueries({ queryKey: ['org-members'] })
    socket.on('org:members:changed', handler)
    return () => {
      socket.off('org:members:changed', handler)
    }
  }, [qc])
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/ubuntu/boardupscale/services/web && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add services/web/src/hooks/useOrganization.ts
git commit -m "feat: add useOrgMembersRealtime hook to invalidate cache on socket event"
```

---

### Task 4: Call the hook in TeamPage

**Files:**
- Modify: `services/web/src/pages/TeamPage.tsx`

- [ ] **Step 1: Import the hook**

Find the import line that already imports hooks from `@/hooks/useOrganization` in `TeamPage.tsx`. Add `useOrgMembersRealtime` to that import:

```ts
import {
  useOrgMembers,
  useInviteMember,
  useUpdateMember,
  useUpdateMemberRole,
  useDeactivateMember,
  useResendInvitation,
  useRevokeInvitation,
  useUpdateMemberEmail,
  useMergePreview,
  useRepairOrgMemberships,
  useOrgMembersRealtime,   // add this
} from '@/hooks/useOrganization'
```

- [ ] **Step 2: Call the hook inside the component**

Find the top of the `TeamPage` component function body (after the first few existing hook calls). Add:

```ts
useOrgMembersRealtime()
```

It needs no arguments and returns nothing. Place it alongside the other hook calls at the top of the component.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/ubuntu/boardupscale/services/web && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add services/web/src/pages/TeamPage.tsx
git commit -m "feat: subscribe to org:members:changed on Team page for real-time updates"
```

---

### Task 5: Push and verify

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

- [ ] **Step 2: Manual smoke test (once deployed)**

1. Open the Team page in two browser tabs logged in as an admin
2. In Tab A, invite a new member
3. Tab B should show the new pending invitation within ~1 second without refreshing
4. In Tab A, revoke the invitation
5. Tab B's Pending Invitations list should remove the entry within ~1 second
6. In Tab A, deactivate a member
7. Tab B's Active Members list should remove the member within ~1 second
