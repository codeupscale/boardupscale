import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { ProjectMemberGuard } from '@/components/common/project-member-guard'
import { useProject, useProjectMembers } from '@/hooks/useProjects'
import { useBoard } from '@/hooks/useBoard'
import { useSprints } from '@/hooks/useSprints'
import { useIssues, useCreateIssue, type CreateIssueVariables } from '@/hooks/useIssues'
import { useHasPermission } from '@/hooks/useHasPermission'
import { IssueType, IssueStatusCategory, SprintStatus } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import { ProjectTabNav } from '@/components/layout/project-tab-nav'
import { IssueTableRow } from '@/components/issues/issue-table-row'
import { IssueForm, IssueFormHandle } from '@/components/issues/issue-form'
import { TableSkeleton, ContentFade } from '@/components/ui/skeleton'
import { Pagination } from '@/components/ui/pagination'
import { Button } from '@/components/ui/button'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogBody } from '@/components/ui/dialog'

const PAGE_SIZE = 25

/**
 * Project → Epics tab.
 *
 * A flat, paginated list of every epic in the project. Rows are pure
 * click-through links (no checkbox, no inline edit, no drag) — clicking
 * a row routes to `/issues/<epicId>` which is the same detail page used
 * by every other issue type. Epic-specific behavior on that page (child
 * issues = story/task/bug, no parent picker) was wired up earlier.
 *
 * Create flow
 * ───────────
 * Header carries a `Create Issue` action (gated on `issue:create`)
 * matching the Backlog/Issues pattern. The Create dialog opens with
 * `type` pre-filled to Epic — the user is on the Epics tab, so that's
 * the obvious default. They can still pick Story/Task/Bug from the type
 * dropdown if they want; this is a convenience, not a restriction.
 *
 * What this page intentionally is NOT
 * ───────────────────────────────────
 * - No filters / search bar (kept simple per design intent)
 * - No progress column (deferred — would require either an aggregate
 *   BE endpoint or fetching every story/task/bug, both of which add
 *   weight for a page meant to be light)
 *
 * Sort order
 * ──────────
 * Uses the BE default (`position ASC, createdAt DESC`). For projects
 * whose epics share a default position (the common case), this resolves
 * to newest-first by created date. If users start manually positioning
 * epics and want strict createdAt ordering instead, we'd add a `sortBy`
 * param to GET /issues — out of scope for this change.
 */
export function ProjectEpicsPage() {
  const { t } = useTranslation()
  const { key: projectKey } = useParams<{ key: string }>()
  const [page, setPage] = useState(1)
  const [showCreateIssue, setShowCreateIssue] = useState(false)
  const issueFormRef = useRef<IssueFormHandle>(null)

  const { data: project } = useProject(projectKey!)
  const { data: board } = useBoard(projectKey!)
  const { data: projectMembers } = useProjectMembers(projectKey!)
  const users = projectMembers?.map((m) => m.user)
  const { data: sprints } = useSprints(projectKey!)
  const activeSprints = (sprints || []).filter((s) => s.status !== SprintStatus.COMPLETED)
  const createIssue = useCreateIssue()
  const { hasPermission } = useHasPermission(projectKey)

  const { data, isLoading } = useIssues({
    projectId: projectKey!,
    type: IssueType.EPIC,
    page,
    limit: PAGE_SIZE,
  })

  const epics = data?.data || []
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <ProjectMemberGuard projectKey={projectKey!}>
      <div className="flex flex-col h-full">
        <PageHeader
          title="Epics"
          breadcrumbs={[
            { label: t('nav.projects'), href: '/projects' },
            { label: project?.name || '...', href: `/projects/${projectKey}/board` },
            { label: 'Epics' },
          ]}
          actions={
            // Permission-gated Create Issue, matches the Backlog/Issues pattern.
            // The dialog pre-fills type=Epic since the user is on the Epics tab.
            hasPermission('issue', 'create') ? (
              <Button size="sm" onClick={() => setShowCreateIssue(true)}>
                <Plus className="h-4 w-4" />
                {t('issues.createIssue')}
              </Button>
            ) : undefined
          }
        />

        <ProjectTabNav projectKey={projectKey!} />

        <div className="p-6 space-y-4 flex-1 overflow-y-auto min-h-0">
          {!isLoading && total > 0 && (
            <p className="text-sm font-bold text-foreground">
              {total} epic{total !== 1 ? 's' : ''}
            </p>
          )}

          {isLoading ? (
            <TableSkeleton />
          ) : epics.length > 0 ? (
            <ContentFade>
              <div className="rounded-xl border border-border/60 bg-card/50 shadow-sm overflow-hidden">
                <table className="w-full">
                  {/* Epics intentionally omit Priority, Status, and Story Points columns —
                      none of them are meaningful on an Epic row. */}
                  <thead>
                    <tr className="sticky top-0 z-10 border-b border-border bg-muted/95 backdrop-blur-sm">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Key</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('common.title')}</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16">{t('common.assignee')}</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">{t('issues.dueDate')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {/*
                      selectable={false} → the entire row becomes a click target
                      that navigates to /issues/<id> (see issue-table-row.tsx).
                      No checkbox, no inline edit, no drag. Reuses the same
                      destination as the Backlog table's epic chip.
                      The show* toggles match the trimmed thead above.
                    */}
                    {epics.map((epic) => (
                      <IssueTableRow
                        key={epic.id}
                        issue={epic}
                        showPriority={false}
                        showStatus={false}
                        showStoryPoints={false}
                      />
                    ))}
                  </tbody>
                </table>

                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  limit={PAGE_SIZE}
                  onPageChange={setPage}
                />
              </div>
            </ContentFade>
          ) : (
            // Minimal empty state per design intent — no CTA. Discoverability
            // points back to the global Create Issue button users already use.
            <div className="rounded-xl border border-border/60 bg-card/40 px-6 py-16 text-center">
              <p className="text-sm font-medium text-foreground">No epics yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create one from the <span className="font-medium text-foreground">Create Ticket</span> button.
              </p>
            </div>
          )}
        </div>

        {/* Create Issue Dialog — pre-defaults type to Epic since this is the
            Epics tab. User can still change type to Story/Task/Bug in the
            form if needed. Mirrors the Backlog page's modal wiring. */}
        <Dialog
          open={showCreateIssue}
          onOpenChange={(o) => !o && issueFormRef.current?.requestClose()}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('issues.createIssue')}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <IssueForm
                ref={issueFormRef}
                projectId={project?.id || projectKey!}
                statuses={board?.statuses?.map((s) => ({ id: s.id, name: s.name }))}
                sprints={activeSprints.map((s) => ({ id: s.id, name: s.name }))}
                users={users || []}
                defaultValues={{
                  type: IssueType.EPIC,
                  // Default Status to the project's first "To Do" status so
                  // the dropdown isn't empty on open. Matches Board/Backlog/Issues.
                  statusId: board?.statuses?.find((s) => s.category === IssueStatusCategory.TODO)?.id,
                }}
                onSubmit={(values) =>
                  createIssue.mutate(
                    {
                      ...values,
                      projectId: project?.id || projectKey!,
                      projectType: project?.type,
                    } as CreateIssueVariables,
                    { onSuccess: () => setShowCreateIssue(false) },
                  )
                }
                onCancel={() => setShowCreateIssue(false)}
                isLoading={createIssue.isPending}
              />
            </DialogBody>
          </DialogContent>
        </Dialog>
      </div>
    </ProjectMemberGuard>
  )
}
