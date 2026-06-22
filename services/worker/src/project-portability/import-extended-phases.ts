/**
 * Portability import phases 7–12 (components through attachments).
 */
import { Pool } from 'pg';
import IORedis from 'ioredis';
import { copyAttachmentObject } from './portability-storage';
import { emptyBundleArrays, ImportJobMaps, serializeImportJobMaps } from './import-job-state';

const ATTACHMENT_BATCH_SIZE = 20;

export const PHASE_COMPONENTS = 7;
export const PHASE_VERSIONS = 8;
export const PHASE_WORK_LOGS = 9;
export const PHASE_ISSUE_LINKS = 10;
export const PHASE_WATCHERS = 11;
export const PHASE_ATTACHMENTS = 12;

interface BundleRow {
  sourceId: string;
  name?: string;
  description?: string | null;
  leadEmail?: string | null;
  status?: string;
  startDate?: string | null;
  releaseDate?: string | null;
  releasedAt?: string | null;
  issueSourceId?: string;
  componentSourceId?: string;
  versionSourceId?: string;
  relationType?: string;
  sourceIssueSourceId?: string;
  targetIssueSourceId?: string;
  linkType?: string;
  createdByEmail?: string;
  createdAt?: string;
  userEmail?: string;
  timeSpent?: number;
  loggedAt?: string;
  updatedAt?: string;
  commentSourceId?: string | null;
  uploaderEmail?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  storageKey?: string;
  storageBucket?: string;
}

interface ExtendedPhaseContext {
  db: Pool;
  io: IORedis | null;
  jobId: string;
  organizationId: string;
  userId: string;
  projectId: string;
  targetProjectKey: string;
  bundle: Record<string, unknown>;
  options: Record<string, unknown>;
  completedPhases: number[];
  maps: ImportJobMaps;
  errors: string[];
  startMs: number;
  sprintStripped: number;
  backlogRemapped: number;
  failedIssues: number;
  processedIssues: number;
  attachmentOffset: number;
  updateJob: (
    patch: Record<string, unknown>,
  ) => Promise<void>;
  resolveUserIdByEmail: (
    email: string | null | undefined,
    fallbackUserId: string,
  ) => Promise<string>;
  isJobCancelled: () => Promise<boolean>;
}

function optBool(options: Record<string, unknown>, key: string, defaultValue = true): boolean {
  return options[key] !== false && defaultValue;
}

export async function runExtendedImportPhases(ctx: ExtendedPhaseContext): Promise<void> {
  const components = emptyBundleArrays(ctx.bundle.components as BundleRow[]);
  const versions = emptyBundleArrays(ctx.bundle.versions as BundleRow[]);
  const workLogs = emptyBundleArrays(ctx.bundle.workLogs as BundleRow[]);
  const issueLinks = emptyBundleArrays(ctx.bundle.issueLinks as BundleRow[]);
  const issueWatchers = emptyBundleArrays(ctx.bundle.issueWatchers as BundleRow[]);
  const attachments = emptyBundleArrays(ctx.bundle.attachments as BundleRow[]);
  const issueComponents = emptyBundleArrays(ctx.bundle.issueComponents as BundleRow[]);
  const issueVersions = emptyBundleArrays(ctx.bundle.issueVersions as BundleRow[]);

  if (
    optBool(ctx.options, 'importComponents', true) &&
    !ctx.completedPhases.includes(PHASE_COMPONENTS)
  ) {
    if (await ctx.isJobCancelled()) return;
    for (const comp of components) {
      const leadId = comp.leadEmail
        ? await ctx.resolveUserIdByEmail(comp.leadEmail, ctx.userId)
        : null;
      const res = await ctx.db.query(
        `INSERT INTO components (project_id, name, description, lead_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (project_id, name) DO UPDATE SET
           description = EXCLUDED.description,
           lead_id = EXCLUDED.lead_id,
           updated_at = NOW()
         RETURNING id`,
        [ctx.projectId, comp.name ?? 'Component', comp.description ?? null, leadId],
      );
      ctx.maps.componentSourceToId.set(comp.sourceId, res.rows[0].id as string);
    }
    for (const ic of issueComponents) {
      const issueId = ctx.maps.issueSourceToId.get(ic.issueSourceId ?? '');
      const componentId = ctx.maps.componentSourceToId.get(ic.componentSourceId ?? '');
      if (!issueId || !componentId) continue;
      await ctx.db.query(
        `INSERT INTO issue_components (issue_id, component_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [issueId, componentId],
      );
    }
    await ctx.updateJob({
      completed_phase: PHASE_COMPONENTS,
      current_phase: PHASE_VERSIONS,
      result_summary: serializeImportJobMaps(ctx.maps, {
        targetProjectId: ctx.projectId,
        targetProjectKey: ctx.targetProjectKey,
        importedIssueCount: ctx.processedIssues,
        failedIssueCount: ctx.failedIssues,
        sprintsStripped: ctx.sprintStripped,
        backlogRemapped: ctx.backlogRemapped,
        durationMs: Date.now() - ctx.startMs,
      }),
    });
  }

  if (
    optBool(ctx.options, 'importVersions', true) &&
    !ctx.completedPhases.includes(PHASE_VERSIONS)
  ) {
    if (await ctx.isJobCancelled()) return;
    for (const ver of versions) {
      const res = await ctx.db.query(
        `INSERT INTO versions (
          project_id, name, description, status, start_date, release_date, released_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (project_id, name) DO UPDATE SET
          description = EXCLUDED.description,
          status = EXCLUDED.status,
          start_date = EXCLUDED.start_date,
          release_date = EXCLUDED.release_date,
          released_at = EXCLUDED.released_at,
          updated_at = NOW()
        RETURNING id`,
        [
          ctx.projectId,
          ver.name ?? 'Version',
          ver.description ?? null,
          ver.status ?? 'unreleased',
          ver.startDate ?? null,
          ver.releaseDate ?? null,
          ver.releasedAt ?? null,
        ],
      );
      ctx.maps.versionSourceToId.set(ver.sourceId, res.rows[0].id as string);
    }
    for (const iv of issueVersions) {
      const issueId = ctx.maps.issueSourceToId.get(iv.issueSourceId ?? '');
      const versionId = ctx.maps.versionSourceToId.get(iv.versionSourceId ?? '');
      if (!issueId || !versionId) continue;
      await ctx.db.query(
        `INSERT INTO issue_versions (issue_id, version_id, relation_type)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [issueId, versionId, iv.relationType ?? 'fix'],
      );
    }
    await ctx.updateJob({
      completed_phase: PHASE_VERSIONS,
      current_phase: PHASE_WORK_LOGS,
      result_summary: serializeImportJobMaps(ctx.maps, {
        targetProjectId: ctx.projectId,
        targetProjectKey: ctx.targetProjectKey,
        importedIssueCount: ctx.processedIssues,
        failedIssueCount: ctx.failedIssues,
        sprintsStripped: ctx.sprintStripped,
        backlogRemapped: ctx.backlogRemapped,
        durationMs: Date.now() - ctx.startMs,
      }),
    });
  }

  if (
    optBool(ctx.options, 'importWorkLogs', true) &&
    !ctx.completedPhases.includes(PHASE_WORK_LOGS)
  ) {
    if (await ctx.isJobCancelled()) return;
    for (const wl of workLogs) {
      const issueId = ctx.maps.issueSourceToId.get(wl.issueSourceId ?? '');
      if (!issueId || !wl.userEmail) continue;
      if (wl.sourceId) {
        const dup = await ctx.db.query(
          `SELECT id FROM work_logs WHERE issue_id = $1 AND portability_source_id = $2 LIMIT 1`,
          [issueId, wl.sourceId],
        );
        if (dup.rows[0]) continue;
      }
      const userId = await ctx.resolveUserIdByEmail(wl.userEmail, ctx.userId);
      await ctx.db.query(
        `INSERT INTO work_logs (
          issue_id, user_id, time_spent, description, logged_at, portability_source_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          issueId,
          userId,
          wl.timeSpent ?? 0,
          wl.description ?? null,
          wl.loggedAt ?? new Date().toISOString(),
          wl.sourceId ?? null,
          wl.createdAt ?? new Date().toISOString(),
          wl.updatedAt ?? new Date().toISOString(),
        ],
      );
    }
    await ctx.updateJob({
      completed_phase: PHASE_WORK_LOGS,
      current_phase: PHASE_ISSUE_LINKS,
    });
  }

  if (
    optBool(ctx.options, 'importIssueLinks', true) &&
    !ctx.completedPhases.includes(PHASE_ISSUE_LINKS)
  ) {
    if (await ctx.isJobCancelled()) return;
    for (const link of issueLinks) {
      const sourceId = ctx.maps.issueSourceToId.get(link.sourceIssueSourceId ?? '');
      const targetId = ctx.maps.issueSourceToId.get(link.targetIssueSourceId ?? '');
      if (!sourceId || !targetId) continue;
      const creatorId = await ctx.resolveUserIdByEmail(link.createdByEmail ?? '', ctx.userId);
      await ctx.db.query(
        `INSERT INTO issue_links (source_issue_id, target_issue_id, link_type, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (source_issue_id, target_issue_id, link_type) DO NOTHING`,
        [
          sourceId,
          targetId,
          link.linkType ?? 'relates_to',
          creatorId,
          link.createdAt ?? new Date().toISOString(),
        ],
      );
    }
    await ctx.updateJob({
      completed_phase: PHASE_ISSUE_LINKS,
      current_phase: PHASE_WATCHERS,
    });
  }

  if (
    optBool(ctx.options, 'importWatchers', true) &&
    !ctx.completedPhases.includes(PHASE_WATCHERS)
  ) {
    if (await ctx.isJobCancelled()) return;
    for (const watcher of issueWatchers) {
      const issueId = ctx.maps.issueSourceToId.get(watcher.issueSourceId ?? '');
      if (!issueId || !watcher.userEmail) continue;
      const userId = await ctx.resolveUserIdByEmail(watcher.userEmail, ctx.userId);
      await ctx.db.query(
        `INSERT INTO issue_watchers (issue_id, user_id, created_at)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [issueId, userId, watcher.createdAt ?? new Date().toISOString()],
      );
    }
    await ctx.updateJob({
      completed_phase: PHASE_WATCHERS,
      current_phase: PHASE_ATTACHMENTS,
    });
  }

  if (
    optBool(ctx.options, 'importAttachments', true) &&
    !ctx.completedPhases.includes(PHASE_ATTACHMENTS)
  ) {
    if (await ctx.isJobCancelled()) return;
    let processedAttachments = 0;
    let failedAttachments = 0;
    const offset = ctx.attachmentOffset ?? 0;

    for (let i = offset; i < attachments.length; i += ATTACHMENT_BATCH_SIZE) {
      if (await ctx.isJobCancelled()) return;
      const batch = attachments.slice(i, i + ATTACHMENT_BATCH_SIZE);
      for (const att of batch) {
        const issueId = ctx.maps.issueSourceToId.get(att.issueSourceId ?? '');
        if (!issueId || !att.storageKey || !att.storageBucket) {
          failedAttachments += 1;
          continue;
        }
        try {
          const existing = await ctx.db.query(
            `SELECT id FROM attachments
             WHERE issue_id = $1 AND portability_source_id = $2`,
            [issueId, att.sourceId],
          );
          if (existing.rows[0]) {
            processedAttachments += 1;
            continue;
          }

          const copied = await copyAttachmentObject(
            att.storageBucket,
            att.storageKey,
            att.fileName ?? 'file',
          );
          const uploaderId = await ctx.resolveUserIdByEmail(att.uploaderEmail ?? '', ctx.userId);
          const res = await ctx.db.query(
            `INSERT INTO attachments (
              issue_id, uploaded_by, file_name, file_size, mime_type,
              storage_key, storage_bucket, portability_source_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id`,
            [
              issueId,
              uploaderId,
              att.fileName ?? 'file',
              copied.fileSize || att.fileSize || 0,
              att.mimeType ?? 'application/octet-stream',
              copied.storageKey,
              copied.storageBucket,
              att.sourceId,
              att.createdAt ?? new Date().toISOString(),
            ],
          );
          const newId = res.rows[0].id as string;
          ctx.maps.importedAttachmentIds.push(newId);
          processedAttachments += 1;
        } catch (err: unknown) {
          failedAttachments += 1;
          const msg = err instanceof Error ? err.message : String(err);
          if (ctx.errors.length < 100) {
            ctx.errors.push(`Attachment ${att.fileName ?? att.sourceId}: ${msg}`);
          }
        }
      }
      await ctx.updateJob({
        processed_attachments: processedAttachments,
        attachment_offset: i + ATTACHMENT_BATCH_SIZE,
        current_phase: PHASE_ATTACHMENTS,
        result_summary: serializeImportJobMaps(ctx.maps, {
          targetProjectId: ctx.projectId,
          targetProjectKey: ctx.targetProjectKey,
          importedIssueCount: ctx.processedIssues,
          failedIssueCount: ctx.failedIssues,
          failedAttachmentCount: failedAttachments,
          sprintsStripped: ctx.sprintStripped,
          backlogRemapped: ctx.backlogRemapped,
          durationMs: Date.now() - ctx.startMs,
        }),
      });
    }
    await ctx.updateJob({
      completed_phase: PHASE_ATTACHMENTS,
      processed_attachments: processedAttachments,
    });
  }
}

export async function applyProjectMetaFromBundle(
  db: Pool,
  projectId: string,
  project: Record<string, unknown>,
  mergeIntoExisting: boolean,
  importProjectSettings: boolean,
): Promise<void> {
  if (!importProjectSettings) return;

  if (mergeIntoExisting) {
    await db.query(
      `UPDATE projects SET
        description = COALESCE($2, description),
        settings = COALESCE($3::jsonb, settings),
        icon_url = COALESCE($4, icon_url),
        color = COALESCE($5, color),
        updated_at = NOW()
       WHERE id = $1`,
      [
        projectId,
        project.description ?? null,
        project.settings != null ? JSON.stringify(project.settings) : null,
        project.iconUrl ?? null,
        project.color ?? null,
      ],
    );
  }
}
