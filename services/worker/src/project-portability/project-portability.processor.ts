/**
 * Project portability import worker — phased BullMQ processor for
 * Boardupscale project bundle imports (Scrum ↔ Kanban transforms).
 */

import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import * as fs from 'fs';
import IORedis from 'ioredis';
import { createRedisConnection, redisConnection } from '../redis';
import { config } from '../config';
import {
  buildImportStatusColumns,
  buildStatusIdMap,
  isKanbanProjectType,
  isKanbanSourceBacklogColumn,
  resolveTargetStatusId,
} from './import-status';
import { loadImportJobMaps, serializeImportJobMaps, emptyBundleArrays } from './import-job-state';
import {
  applyProjectMetaFromBundle,
  runExtendedImportPhases,
} from './import-extended-phases';

const QUEUE_NAME = 'project-portability';
const PROGRESS_FLUSH_MS = 3000;
const ISSUE_BATCH_SIZE = 50;

const PHASE_PROJECT = 1;
const PHASE_MEMBERS = 2;
const PHASE_SPRINTS = 3;
const PHASE_ISSUES = 4;
const PHASE_COMMENTS = 5;
const PHASE_CUSTOM_FIELDS = 6;

interface PortabilityJobData {
  jobId: string;
  organizationId: string;
  userId: string;
}

interface UndoJobData extends PortabilityJobData {}

interface BundleIssue {
  sourceId: string;
  sourceKey: string;
  number: number;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  statusName: string;
  statusCategory: string;
  sprintSourceId: string | null;
  parentSourceId: string | null;
  assigneeEmail: string | null;
  reporterEmail: string;
  storyPoints: number | null;
  timeEstimate: number | null;
  timeSpent: number;
  dueDate: string | null;
  labels: string[];
  position: number;
  createdAt?: string;
  updatedAt?: string;
}

interface ProjectBundle {
  manifest: {
    exportId: string;
    sourceProjectType: string;
    organizationId: string;
  };
  project?: {
    description?: string | null;
    settings?: unknown;
    iconUrl?: string | null;
    color?: string | null;
  };
  issues: BundleIssue[];
  sprints: Array<{
    sourceId: string;
    name: string;
    goal: string | null;
    status: string;
    startDate: string | null;
    endDate: string | null;
    completedAt: string | null;
  }>;
  members: Array<{ userEmail: string; role: string }>;
  comments: Array<{
    sourceId?: string;
    issueSourceId: string;
    authorEmail: string;
    content: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  customFieldDefinitions: Array<{
    sourceId: string;
    name: string;
    fieldKey: string;
    fieldType: string;
    description: string | null;
    isRequired: boolean;
    defaultValue: unknown;
    options: unknown;
    position: number;
  }>;
  customFieldValues: Array<{
    issueSourceId: string;
    fieldKey: string;
    value: unknown;
  }>;
  previewResult?: {
    statusMappings: Array<{ sourceName: string; targetName: string; targetCategory?: string }>;
  };
  statuses?: Array<{
    sourceId: string;
    name: string;
    category: string;
    color: string;
    position: number;
    isDefault: boolean;
    wipLimit: number;
  }>;
  components?: unknown[];
  versions?: unknown[];
  issueComponents?: unknown[];
  issueVersions?: unknown[];
  attachments?: unknown[];
  issueLinks?: unknown[];
  issueWatchers?: unknown[];
  workLogs?: unknown[];
}

interface JobRow {
  id: string;
  status: string;
  organization_id: string;
  triggered_by_id: string;
  bundle_file_path: string;
  target_type: string;
  target_project_key: string;
  target_project_name: string;
  source_type: string | null;
  import_options: {
    importComments?: boolean;
    importMembers?: boolean;
    importCustomFields?: boolean;
    importSprints?: boolean;
    importComponents?: boolean;
    importVersions?: boolean;
    importAttachments?: boolean;
    importIssueLinks?: boolean;
    importWatchers?: boolean;
    importWorkLogs?: boolean;
    importProjectSettings?: boolean;
    preserveIssueNumbers?: boolean;
    preserveTimestamps?: boolean;
    mergeIntoExisting?: boolean;
    statusMapping?: Record<string, string>;
  } | null;
  preview_result: ProjectBundle['previewResult'] | null;
  current_phase: number;
  completed_phases: number[];
  current_offset: number;
  attachment_offset?: number;
  total_issues: number;
  processed_issues: number;
  failed_issues: number;
  total_comments: number;
  processed_comments: number;
  total_sprints: number;
  processed_sprints: number;
  total_attachments?: number;
  processed_attachments?: number;
  target_project_id: string | null;
  result_summary: Record<string, unknown> | null;
}

async function publishProgress(
  io: IORedis | null,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!io) return;
  try {
    await io.publish('portability:progress', JSON.stringify(payload));
  } catch {
    // non-fatal
  }
}

async function updateJob(
  db: Pool,
  io: IORedis | null,
  jobId: string,
  organizationId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [jobId];
  let idx = 2;

  const add = (col: string, val: unknown) => {
    fields.push(`${col} = $${idx++}`);
    values.push(val);
  };

  if (patch.status !== undefined) add('status', patch.status);
  if (patch.current_phase !== undefined) add('current_phase', patch.current_phase);
  if (patch.current_offset !== undefined) add('current_offset', patch.current_offset);
  if (patch.processed_issues !== undefined) add('processed_issues', patch.processed_issues);
  if (patch.failed_issues !== undefined) add('failed_issues', patch.failed_issues);
  if (patch.processed_comments !== undefined) add('processed_comments', patch.processed_comments);
  if (patch.processed_sprints !== undefined) add('processed_sprints', patch.processed_sprints);
  if (patch.processed_attachments !== undefined) add('processed_attachments', patch.processed_attachments);
  if (patch.attachment_offset !== undefined) add('attachment_offset', patch.attachment_offset);
  if (patch.target_project_id !== undefined) add('target_project_id', patch.target_project_id);
  if (patch.result_summary !== undefined) add('result_summary', JSON.stringify(patch.result_summary));
  if (patch.error_log !== undefined) add('error_log', JSON.stringify(patch.error_log));
  if (patch.completed_phase !== undefined) {
    fields.push(`completed_phases = completed_phases || $${idx++}::jsonb`);
    values.push(JSON.stringify([patch.completed_phase]));
  }
  if (patch.status === 'processing') {
    fields.push('started_at = COALESCE(started_at, NOW())');
  }
  if (patch.status === 'completed' || patch.status === 'failed' || patch.status === 'undone') {
    fields.push('completed_at = NOW()');
  }

  if (fields.length === 0) return;

  await db.query(
    `UPDATE project_portability_jobs SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1`,
    values,
  );

  await publishProgress(io, {
    jobId,
    organizationId,
    ...patch,
  });
}

async function loadJob(db: Pool, jobId: string): Promise<JobRow | null> {
  const res = await db.query(`SELECT * FROM project_portability_jobs WHERE id = $1`, [jobId]);
  return (res.rows[0] as JobRow) ?? null;
}

async function isJobCancelled(db: Pool, jobId: string): Promise<boolean> {
  const res = await db.query(
    `SELECT status FROM project_portability_jobs WHERE id = $1`,
    [jobId],
  );
  return res.rows[0]?.status === 'cancelled';
}

async function loadBundle(filePath: string): Promise<ProjectBundle> {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ProjectBundle;
  return {
    ...raw,
    components: emptyBundleArrays(raw.components as unknown[]),
    versions: emptyBundleArrays(raw.versions as unknown[]),
    issueComponents: emptyBundleArrays(raw.issueComponents as unknown[]),
    issueVersions: emptyBundleArrays(raw.issueVersions as unknown[]),
    attachments: emptyBundleArrays(raw.attachments as unknown[]),
    issueLinks: emptyBundleArrays(raw.issueLinks as unknown[]),
    issueWatchers: emptyBundleArrays(raw.issueWatchers as unknown[]),
    workLogs: emptyBundleArrays(raw.workLogs as unknown[]),
  };
}

async function resolveUserIdByEmail(
  db: Pool,
  organizationId: string,
  email: string | null | undefined,
  fallbackUserId: string,
): Promise<string> {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!normalized) return fallbackUserId;
  const res = await db.query(
    `SELECT u.id FROM users u
     INNER JOIN organization_members om ON om.user_id = u.id
     WHERE LOWER(u.email) = $1 AND om.organization_id = $2
     LIMIT 1`,
    [normalized, organizationId],
  );
  return (res.rows[0]?.id as string) ?? fallbackUserId;
}

async function resolveImportIssueNumber(
  db: Pool,
  projectId: string,
  sourceNumber: number | undefined,
  nextNumber: number,
  preserveNumbers: boolean,
): Promise<number> {
  if (!preserveNumbers || !sourceNumber || sourceNumber < 1) {
    return nextNumber;
  }
  const clash = await db.query(
    `SELECT id FROM issues WHERE project_id = $1 AND number = $2 AND deleted_at IS NULL LIMIT 1`,
    [projectId, sourceNumber],
  );
  return clash.rows[0] ? nextNumber : sourceNumber;
}

async function processImportJob(db: Pool, io: IORedis | null, data: PortabilityJobData): Promise<void> {
  const startMs = Date.now();
  const job = await loadJob(db, data.jobId);
  if (!job) {
    throw new Error(`Portability job ${data.jobId} not found`);
  }

  if (job.status === 'cancelled') return;

  if (!job.bundle_file_path || !fs.existsSync(job.bundle_file_path)) {
    throw new Error('Import bundle file is missing or expired on the server');
  }

  const bundle = await loadBundle(job.bundle_file_path);
  const options = job.import_options ?? {};
  const maps = loadImportJobMaps(job.result_summary);
  const errors: string[] = [];
  let sprintStripped = 0;
  let backlogRemapped = 0;
  const importProjectSettings = options.importProjectSettings !== false;
  const preserveNumbers = options.preserveIssueNumbers !== false;
  const preserveTimestamps = options.preserveTimestamps !== false;
  const mergeIntoExisting =
    options.mergeIntoExisting === true || !!job.target_project_id;

  await updateJob(db, io, job.id, data.organizationId, {
    status: 'processing',
    current_phase: job.current_phase || PHASE_PROJECT,
  });

  let projectId = job.target_project_id;
  let statusRows: Array<{ id: string; name: string; category: string }> = [];

  // ── Phase 1: Project + statuses ─────────────────────────────────────────
  if (!job.completed_phases?.includes(PHASE_PROJECT)) {
    if (await isJobCancelled(db, job.id)) return;
    const statusesToCreate = buildImportStatusColumns(
      bundle.statuses ?? [],
      job.preview_result,
      job.target_type,
    );

    if (mergeIntoExisting && job.target_project_id) {
      projectId = job.target_project_id;
      const projCheck = await db.query(
        `SELECT id FROM projects WHERE id = $1 AND organization_id = $2 AND status != 'archived'`,
        [projectId, data.organizationId],
      );
      if (!projCheck.rows[0]) {
        throw new Error('Target project not found or is archived');
      }

      const existingStatusRes = await db.query(
        `SELECT id, name, category FROM issue_statuses WHERE project_id = $1 ORDER BY position ASC`,
        [projectId],
      );
      const existingNames = new Set(
        (existingStatusRes.rows as Array<{ name: string }>).map((r) =>
          r.name.trim().toLowerCase(),
        ),
      );

      for (const s of statusesToCreate) {
        if (existingNames.has(s.name.trim().toLowerCase())) {
          continue;
        }
        await db.query(
          `INSERT INTO issue_statuses (project_id, name, category, color, position, is_default, wip_limit, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, false, $6, NOW(), NOW())`,
          [projectId, s.name, s.category, s.color, s.position, s.wipLimit],
        );
      }

      const statusRes = await db.query(
        `SELECT id, name, category FROM issue_statuses WHERE project_id = $1 ORDER BY position ASC`,
        [projectId],
      );
      statusRows = statusRes.rows as Array<{ id: string; name: string; category: string }>;
    } else {
      const projectMeta = bundle.project ?? {};
      const projRes = await db.query(
        `INSERT INTO projects (
          organization_id, name, key, description, type, status, owner_id, next_issue_number,
          settings, icon_url, color, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'active', $6, 1, $7::jsonb, $8, $9, NOW(), NOW())
         RETURNING id`,
        [
          data.organizationId,
          job.target_project_name,
          job.target_project_key,
          importProjectSettings ? (projectMeta.description ?? null) : null,
          job.target_type,
          data.userId,
          importProjectSettings && projectMeta.settings != null
            ? JSON.stringify(projectMeta.settings)
            : null,
          importProjectSettings ? (projectMeta.iconUrl ?? null) : null,
          importProjectSettings ? (projectMeta.color ?? null) : null,
        ],
      );
      projectId = projRes.rows[0].id as string;

      await db.query(
        `INSERT INTO project_members (project_id, user_id, role, created_at)
         VALUES ($1, $2, 'admin', NOW())
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [projectId, data.userId],
      );

      for (const s of statusesToCreate) {
        await db.query(
          `INSERT INTO issue_statuses (project_id, name, category, color, position, is_default, wip_limit, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
          [projectId, s.name, s.category, s.color, s.position, s.isDefault, s.wipLimit],
        );
      }

      const statusRes = await db.query(
        `SELECT id, name, category FROM issue_statuses WHERE project_id = $1 ORDER BY position ASC`,
        [projectId],
      );
      statusRows = statusRes.rows as Array<{ id: string; name: string; category: string }>;
    }

    if (importProjectSettings && bundle.project && mergeIntoExisting) {
      await applyProjectMetaFromBundle(
        db,
        projectId!,
        bundle.project as Record<string, unknown>,
        true,
        true,
      );
    }

    await updateJob(db, io, job.id, data.organizationId, {
      target_project_id: projectId,
      current_phase: PHASE_MEMBERS,
      completed_phase: PHASE_PROJECT,
    });
  } else if (projectId) {
    const statusRes = await db.query(
      `SELECT id, name, category FROM issue_statuses WHERE project_id = $1 ORDER BY position ASC`,
      [projectId],
    );
    statusRows = statusRes.rows as Array<{ id: string; name: string; category: string }>;
  }

  if (!projectId) {
    throw new Error('Target project was not created');
  }

  const statusMap = buildStatusIdMap(job.preview_result, statusRows);
  const { issueSourceToId, sprintSourceToId, fieldKeyToId } = maps;

  // ── Phase 2: Members ──────────────────────────────────────────────────────
  if (
    options.importMembers !== false &&
    !job.completed_phases?.includes(PHASE_MEMBERS)
  ) {
    if (await isJobCancelled(db, job.id)) return;
    for (const member of bundle.members ?? []) {
      const userId = await resolveUserIdByEmail(
        db,
        data.organizationId,
        member.userEmail,
        data.userId,
      );
      await db.query(
        `INSERT INTO project_members (project_id, user_id, role, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [projectId, userId, member.role ?? 'member'],
      );
    }
    await updateJob(db, io, job.id, data.organizationId, {
      current_phase: PHASE_SPRINTS,
      completed_phase: PHASE_MEMBERS,
    });
  }

  // ── Phase 3: Sprints (Scrum target only) ────────────────────────────────
  if (
    options.importSprints !== false &&
    !isKanbanProjectType(job.target_type) &&
    !job.completed_phases?.includes(PHASE_SPRINTS)
  ) {
    if (await isJobCancelled(db, job.id)) return;
    let processedSprints = job.processed_sprints ?? 0;
    for (const sprint of bundle.sprints ?? []) {
      if (sprintSourceToId.has(sprint.sourceId)) {
        processedSprints += 1;
        continue;
      }
      const res = await db.query(
        `INSERT INTO sprints (project_id, name, goal, status, start_date, end_date, completed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING id`,
        [
          projectId,
          sprint.name ?? 'Sprint',
          sprint.goal ?? null,
          sprint.status ?? 'planned',
          sprint.startDate ?? null,
          sprint.endDate ?? null,
          sprint.completedAt ?? null,
        ],
      );
      sprintSourceToId.set(sprint.sourceId, res.rows[0].id as string);
      processedSprints += 1;
    }
    await updateJob(db, io, job.id, data.organizationId, {
      processed_sprints: processedSprints,
      current_phase: PHASE_ISSUES,
      completed_phase: PHASE_SPRINTS,
      result_summary: serializeImportJobMaps(maps, {
        targetProjectId: projectId,
        targetProjectKey: job.target_project_key,
        importedIssueCount: maps.importedIssueIds.length,
        failedIssueCount: job.failed_issues ?? 0,
        sprintsStripped: sprintStripped,
        backlogRemapped,
        durationMs: Date.now() - startMs,
      }),
    });
  }

  // ── Phase 4: Issues (two-pass for parent hierarchy) ─────────────────────
  const issues = bundle.issues ?? [];
  const offset = job.current_offset ?? 0;
  let processedIssues = job.processed_issues ?? 0;
  let failedIssues = job.failed_issues ?? 0;
  let nextNumber = 1;

  if (!job.completed_phases?.includes(PHASE_ISSUES)) {
    if (await isJobCancelled(db, job.id)) return;
    const nextNumRes = await db.query(
      `SELECT COALESCE(MAX(number), 0) + 1 AS next FROM issues WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId],
    );
    nextNumber = Number(nextNumRes.rows[0]?.next ?? 1);

    const sortedIssues = [...issues].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

    // Pass 1: create issues without parent
    for (let i = offset; i < sortedIssues.length; i += ISSUE_BATCH_SIZE) {
      if (await isJobCancelled(db, job.id)) return;
      const batch = sortedIssues.slice(i, i + ISSUE_BATCH_SIZE);
      for (const issue of batch) {
        try {
          if (issueSourceToId.has(issue.sourceId)) {
            processedIssues += 1;
            continue;
          }

          const statusId = resolveTargetStatusId(
            issue,
            job.source_type,
            job.target_type,
            statusMap,
            statusRows,
          );
          const reporterId = await resolveUserIdByEmail(
            db,
            data.organizationId,
            issue.reporterEmail,
            data.userId,
          );
          const assigneeId = issue.assigneeEmail
            ? await resolveUserIdByEmail(db, data.organizationId, issue.assigneeEmail, reporterId)
            : null;

          let sprintId: string | null = null;
          if (!isKanbanProjectType(job.target_type) && issue.sprintSourceId) {
            sprintId = sprintSourceToId.get(issue.sprintSourceId) ?? null;
          } else if (isKanbanProjectType(job.target_type) && issue.sprintSourceId) {
            sprintStripped += 1;
          }

          if (
            !isKanbanProjectType(job.target_type) &&
            isKanbanSourceBacklogColumn(job.source_type, issue.statusName)
          ) {
            backlogRemapped += 1;
          }

          const issueNumber = await resolveImportIssueNumber(
            db,
            projectId,
            issue.number,
            nextNumber,
            preserveNumbers,
          );
          const issueKey = `${job.target_project_key}-${issueNumber}`;
          const createdAt =
            preserveTimestamps && issue.createdAt
              ? issue.createdAt
              : new Date().toISOString();
          const updatedAt =
            preserveTimestamps && issue.updatedAt ? issue.updatedAt : createdAt;

          const res = await db.query(
            `INSERT INTO issues (
              organization_id, project_id, sprint_id, status_id, reporter_id, assignee_id,
              parent_id, number, key, title, description, type, priority, story_points,
              time_estimate, time_spent, due_date, labels, position, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6,
              NULL, $7, $8, $9, $10, $11, $12, $13,
              $14, $15, $16, $17, $18, $19, $20
            ) RETURNING id`,
            [
              data.organizationId,
              projectId,
              sprintId,
              statusId,
              reporterId,
              assigneeId,
              issueNumber,
              issueKey,
              issue.title ?? '',
              issue.description ?? null,
              issue.type ?? 'task',
              issue.priority ?? 'medium',
              issue.storyPoints ?? null,
              issue.timeEstimate ?? null,
              issue.timeSpent ?? 0,
              issue.dueDate ?? null,
              issue.labels ?? [],
              issue.position ?? 0,
              createdAt,
              updatedAt,
            ],
          );
          const newId = res.rows[0].id as string;
          issueSourceToId.set(issue.sourceId, newId);
          maps.importedIssueIds.push(newId);
          nextNumber = Math.max(nextNumber, issueNumber + 1);
          processedIssues += 1;
        } catch (err: unknown) {
          failedIssues += 1;
          const msg = err instanceof Error ? err.message : String(err);
          if (errors.length < 100) errors.push(`Issue ${issue.sourceKey}: ${msg}`);
        }
      }

      await updateJob(db, io, job.id, data.organizationId, {
        processed_issues: processedIssues,
        failed_issues: failedIssues,
        current_offset: i + ISSUE_BATCH_SIZE,
        current_phase: PHASE_ISSUES,
        result_summary: serializeImportJobMaps(maps, {
          targetProjectId: projectId,
          targetProjectKey: job.target_project_key,
          importedIssueCount: maps.importedIssueIds.length,
          failedIssueCount: failedIssues,
          sprintsStripped: sprintStripped,
          backlogRemapped,
          durationMs: Date.now() - startMs,
        }),
      });
    }

    // Pass 2: parent links
    for (const issue of sortedIssues) {
      if (!issue.parentSourceId) continue;
      const childId = issueSourceToId.get(issue.sourceId);
      const parentId = issueSourceToId.get(issue.parentSourceId);
      if (childId && parentId) {
        await db.query(`UPDATE issues SET parent_id = $1 WHERE id = $2`, [parentId, childId]);
      }
    }

    await db.query(`UPDATE projects SET next_issue_number = $1 WHERE id = $2`, [
      nextNumber,
      projectId,
    ]);

    await updateJob(db, io, job.id, data.organizationId, {
      completed_phase: PHASE_ISSUES,
      current_phase: PHASE_COMMENTS,
      current_offset: 0,
    });
  } else {
    const existing = await db.query(
      `SELECT id FROM issues WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId],
    );
    for (const row of existing.rows) {
      const id = row.id as string;
      if (!maps.importedIssueIds.includes(id)) {
        maps.importedIssueIds.push(id);
      }
    }
  }

  // ── Phase 5: Comments ───────────────────────────────────────────────────
  if (
    options.importComments !== false &&
    !job.completed_phases?.includes(PHASE_COMMENTS)
  ) {
    if (await isJobCancelled(db, job.id)) return;
    let processedComments = 0;
    for (const comment of bundle.comments ?? []) {
      const issueId = issueSourceToId.get(comment.issueSourceId);
      if (!issueId) continue;
      if (comment.sourceId) {
        const dup = await db.query(
          `SELECT id FROM comments WHERE issue_id = $1 AND portability_source_id = $2 LIMIT 1`,
          [issueId, comment.sourceId],
        );
        if (dup.rows[0]) {
          processedComments += 1;
          continue;
        }
      }
      const authorId = await resolveUserIdByEmail(
        db,
        data.organizationId,
        comment.authorEmail,
        data.userId,
      );
      const createdAt =
        preserveTimestamps && comment.createdAt
          ? comment.createdAt
          : new Date().toISOString();
      const updatedAt =
        preserveTimestamps && comment.updatedAt ? comment.updatedAt : createdAt;
      await db.query(
        `INSERT INTO comments (
          issue_id, author_id, content, portability_source_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          issueId,
          authorId,
          comment.content ?? '',
          comment.sourceId ?? null,
          createdAt,
          updatedAt,
        ],
      );
      processedComments += 1;
    }
    await updateJob(db, io, job.id, data.organizationId, {
      processed_comments: processedComments,
      current_phase: PHASE_CUSTOM_FIELDS,
      completed_phase: PHASE_COMMENTS,
    });
  }

  // ── Phase 6: Custom fields ──────────────────────────────────────────────
  if (
    options.importCustomFields !== false &&
    !job.completed_phases?.includes(PHASE_CUSTOM_FIELDS)
  ) {
    if (await isJobCancelled(db, job.id)) return;
    const fieldKeyToId = maps.fieldKeyToId;
    for (const def of bundle.customFieldDefinitions ?? []) {
      if (fieldKeyToId.has(def.fieldKey)) {
        continue;
      }
      const res = await db.query(
        `INSERT INTO custom_field_definitions (
          organization_id, project_id, name, field_key, field_type, description,
          is_required, default_value, options, position, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING id`,
        [
          data.organizationId,
          projectId,
          def.name,
          def.fieldKey,
          def.fieldType,
          def.description ?? null,
          def.isRequired ?? false,
          def.defaultValue != null ? JSON.stringify(def.defaultValue) : null,
          def.options != null ? JSON.stringify(def.options) : null,
          def.position ?? 0,
        ],
      );
      fieldKeyToId.set(def.fieldKey, res.rows[0].id as string);
    }

    for (const fv of bundle.customFieldValues ?? []) {
      const issueId = issueSourceToId.get(fv.issueSourceId);
      const fieldId = fieldKeyToId.get(fv.fieldKey);
      if (!issueId || !fieldId) continue;
      await db.query(
        `INSERT INTO custom_field_values (issue_id, field_id, value, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [issueId, fieldId, JSON.stringify(fv.value)],
      );
    }

    await updateJob(db, io, job.id, data.organizationId, {
      completed_phase: PHASE_CUSTOM_FIELDS,
      result_summary: serializeImportJobMaps(maps, {
        targetProjectId: projectId,
        targetProjectKey: job.target_project_key,
        importedIssueCount: maps.importedIssueIds.length,
        failedIssueCount: failedIssues,
        sprintsStripped: sprintStripped,
        backlogRemapped,
        durationMs: Date.now() - startMs,
      }),
    });
  }

  await runExtendedImportPhases({
    db,
    io,
    jobId: job.id,
    organizationId: data.organizationId,
    userId: data.userId,
    projectId,
    targetProjectKey: job.target_project_key,
    bundle: bundle as unknown as Record<string, unknown>,
    options: options as Record<string, unknown>,
    completedPhases: job.completed_phases ?? [],
    maps,
    errors,
    startMs,
    sprintStripped,
    backlogRemapped,
    failedIssues,
    processedIssues,
    attachmentOffset: job.attachment_offset ?? 0,
    updateJob: (patch) => updateJob(db, io, job.id, data.organizationId, patch),
    resolveUserIdByEmail: (email, fallback) =>
      resolveUserIdByEmail(db, data.organizationId, email, fallback),
    isJobCancelled: () => isJobCancelled(db, job.id),
  });

  const resultSummary = serializeImportJobMaps(maps, {
    targetProjectId: projectId,
    targetProjectKey: job.target_project_key,
    importedIssueCount: maps.importedIssueIds.length,
    failedIssueCount: failedIssues,
    sprintsStripped: sprintStripped,
    backlogRemapped,
    durationMs: Date.now() - startMs,
  });

  await updateJob(db, io, job.id, data.organizationId, {
    status: 'completed',
    result_summary: resultSummary,
    error_log: errors.length > 0 ? errors : null,
  });
}

async function processUndoJob(db: Pool, io: IORedis | null, data: UndoJobData): Promise<void> {
  const job = await loadJob(db, data.jobId);
  const maps = loadImportJobMaps(job?.result_summary ?? null);
  const issueIds = maps.importedIssueIds;
  const attachmentIds = maps.importedAttachmentIds;

  if (!job?.target_project_id || issueIds.length === 0) {
    await updateJob(db, io, data.jobId, data.organizationId, {
      status: 'undone',
    });
    return;
  }

  if (attachmentIds.length > 0) {
    await db.query(`DELETE FROM attachments WHERE id = ANY($1::uuid[])`, [attachmentIds]);
  }

  await db.query(
    `UPDATE issues SET deleted_at = NOW() WHERE id = ANY($1::uuid[]) AND project_id = $2`,
    [issueIds, job.target_project_id],
  );

  const mergeIntoExisting = job.import_options?.mergeIntoExisting === true;
  if (!mergeIntoExisting) {
    await db.query(
      `UPDATE projects SET status = 'archived', updated_at = NOW() WHERE id = $1`,
      [job.target_project_id],
    );
  }
  await updateJob(db, io, data.jobId, data.organizationId, {
    status: 'undone',
  });
}

export function createProjectPortabilityWorker(db: Pool): Worker {
  const io = createRedisConnection();

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job<PortabilityJobData | UndoJobData>) => {
      console.log(`[PortabilityWorker] Processing job ${job.name} (${job.data.jobId})`);
      try {
        if (job.name === 'project-undo') {
          await processUndoJob(db, io, job.data as UndoJobData);
          return;
        }
        await processImportJob(db, io, job.data as PortabilityJobData);
        console.log(`[PortabilityWorker] Completed job ${job.data.jobId}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[PortabilityWorker] Job ${job.data.jobId} error:`, message);
        throw err;
      }
    },
    {
      connection: redisConnection as any,
      concurrency: 1,
      lockDuration: 5 * 60 * 1000,
      stalledInterval: 30 * 1000,
      maxStalledCount: 2,
    },
  );

  worker.on('stalled', (jobId) => {
    console.warn(`[PortabilityWorker] Job stalled in queue: ${jobId}`);
  });

  worker.on('failed', async (job, err) => {
    if (!job?.data?.jobId) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if ((job.attemptsMade ?? 0) < maxAttempts) {
      console.warn(
        `[PortabilityWorker] Job ${job.data.jobId} attempt ${job.attemptsMade}/${maxAttempts} failed — retrying`,
      );
      return;
    }
    try {
      await updateJob(db, io, job.data.jobId, job.data.organizationId, {
        status: 'failed',
        error_log: [err.message],
      });
    } catch {
      // ignore
    }
  });

  console.log(`[PortabilityWorker] Listening on queue "${QUEUE_NAME}"`);
  return worker;
}
