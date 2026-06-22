import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Project } from '../projects/entities/project.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Issue } from '../issues/entities/issue.entity';
import { Comment } from '../comments/entities/comment.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';
import { CustomFieldDefinition } from '../custom-fields/entities/custom-field-definition.entity';
import { CustomFieldValue } from '../custom-fields/entities/custom-field-value.entity';
import { Component } from '../components/entities/component.entity';
import { Version } from '../versions/entities/version.entity';
import { Attachment } from '../files/entities/attachment.entity';
import { IssueLink } from '../issues/entities/issue-link.entity';
import { IssueWatcher } from '../issues/entities/issue-watcher.entity';
import { WorkLog } from '../issues/entities/work-log.entity';
import { IssueComponent } from '../components/entities/issue-component.entity';
import { IssueVersion } from '../versions/entities/issue-version.entity';
import { PROJECT_BUNDLE_VERSION, ProjectBundle } from './types/project-bundle.types';
import { ProjectTypeValue } from '../projects/project-type';

@Injectable()
export class ProjectPortabilityExportService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(IssueStatus)
    private readonly statusRepository: Repository<IssueStatus>,
    @InjectRepository(Sprint)
    private readonly sprintRepository: Repository<Sprint>,
    @InjectRepository(Issue)
    private readonly issueRepository: Repository<Issue>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(ProjectMember)
    private readonly memberRepository: Repository<ProjectMember>,
    @InjectRepository(CustomFieldDefinition)
    private readonly fieldDefRepository: Repository<CustomFieldDefinition>,
    @InjectRepository(CustomFieldValue)
    private readonly fieldValueRepository: Repository<CustomFieldValue>,
    @InjectRepository(Component)
    private readonly componentRepository: Repository<Component>,
    @InjectRepository(Version)
    private readonly versionRepository: Repository<Version>,
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
    @InjectRepository(IssueLink)
    private readonly issueLinkRepository: Repository<IssueLink>,
    @InjectRepository(IssueWatcher)
    private readonly issueWatcherRepository: Repository<IssueWatcher>,
    @InjectRepository(WorkLog)
    private readonly workLogRepository: Repository<WorkLog>,
    @InjectRepository(IssueComponent)
    private readonly issueComponentRepository: Repository<IssueComponent>,
    @InjectRepository(IssueVersion)
    private readonly issueVersionRepository: Repository<IssueVersion>,
  ) {}

  async exportBundle(projectId: string, organizationId: string): Promise<ProjectBundle> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, organizationId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const [
      statuses,
      sprints,
      issues,
      members,
      fieldDefs,
      components,
      versions,
    ] = await Promise.all([
      this.statusRepository.find({ where: { projectId }, order: { position: 'ASC' } }),
      this.sprintRepository.find({ where: { projectId }, order: { startDate: 'ASC' } }),
      this.issueRepository
        .createQueryBuilder('issue')
        .leftJoinAndSelect('issue.status', 'status')
        .leftJoinAndSelect('issue.sprint', 'sprint')
        .leftJoinAndSelect('issue.assignee', 'assignee')
        .leftJoinAndSelect('issue.reporter', 'reporter')
        .where('issue.project_id = :projectId', { projectId })
        .andWhere('issue.organization_id = :organizationId', { organizationId })
        .andWhere('issue.deleted_at IS NULL')
        .orderBy('issue.number', 'ASC')
        .getMany(),
      this.memberRepository.find({ where: { projectId }, relations: ['user'] }),
      this.fieldDefRepository.find({
        where: { projectId, organizationId },
        order: { position: 'ASC' },
      }),
      this.componentRepository.find({
        where: { projectId },
        relations: ['lead'],
        order: { name: 'ASC' },
      }),
      this.versionRepository.find({ where: { projectId }, order: { name: 'ASC' } }),
    ]);

    const issueIds = issues.map((i) => i.id);

    const [
      comments,
      fieldValues,
      attachments,
      issueLinks,
      issueWatchers,
      workLogs,
      issueComponents,
      issueVersions,
    ] = await Promise.all([
      issueIds.length > 0
        ? this.commentRepository
            .createQueryBuilder('comment')
            .leftJoinAndSelect('comment.author', 'author')
            .where('comment.issue_id IN (:...issueIds)', { issueIds })
            .andWhere('comment.deleted_at IS NULL')
            .orderBy('comment.created_at', 'ASC')
            .getMany()
        : [],
      issueIds.length > 0 && fieldDefs.length > 0
        ? this.fieldValueRepository
            .createQueryBuilder('fv')
            .innerJoinAndSelect('fv.field', 'field')
            .where('fv.issue_id IN (:...issueIds)', { issueIds })
            .getMany()
        : [],
      issueIds.length > 0
        ? this.attachmentRepository
            .createQueryBuilder('a')
            .leftJoinAndSelect('a.uploader', 'uploader')
            .where('a.issue_id IN (:...issueIds)', { issueIds })
            .orderBy('a.created_at', 'ASC')
            .getMany()
        : [],
      issueIds.length > 0
        ? this.issueLinkRepository
            .createQueryBuilder('link')
            .leftJoinAndSelect('link.creator', 'creator')
            .where('link.source_issue_id IN (:...issueIds)', { issueIds })
            .orWhere('link.target_issue_id IN (:...issueIds)', { issueIds })
            .getMany()
        : [],
      issueIds.length > 0
        ? this.issueWatcherRepository.find({
            where: { issueId: In(issueIds) },
            relations: ['user'],
          })
        : [],
      issueIds.length > 0
        ? this.workLogRepository.find({
            where: { issueId: In(issueIds) },
            relations: ['user'],
            order: { loggedAt: 'ASC' },
          })
        : [],
      issueIds.length > 0
        ? this.issueComponentRepository.find({ where: { issueId: In(issueIds) } })
        : [],
      issueIds.length > 0
        ? this.issueVersionRepository.find({ where: { issueId: In(issueIds) } })
        : [],
    ]);

    const fieldKeyById = new Map(fieldDefs.map((f) => [f.id, f.fieldKey]));

    return {
      manifest: {
        version: PROJECT_BUNDLE_VERSION,
        exportId: uuidv4(),
        exportedAt: new Date().toISOString(),
        sourceProjectId: project.id,
        sourceProjectKey: project.key,
        sourceProjectType: (project.type ?? 'scrum') as ProjectTypeValue,
        organizationId,
      },
      project: {
        name: project.name ?? '',
        key: project.key ?? '',
        description: project.description ?? null,
        type: (project.type ?? 'scrum') as ProjectTypeValue,
        settings: (project.settings as Record<string, unknown>) ?? null,
        iconUrl: project.iconUrl ?? null,
        color: project.color ?? null,
      },
      statuses: statuses.map((s) => ({
        sourceId: s.id,
        name: s.name ?? '',
        category: (s.category ?? 'todo') as 'todo' | 'in_progress' | 'done',
        color: s.color ?? '#6B7280',
        position: s.position ?? 0,
        isDefault: s.isDefault ?? false,
        wipLimit: s.wipLimit ?? 0,
      })),
      sprints: sprints.map((sp) => ({
        sourceId: sp.id,
        name: sp.name ?? '',
        goal: sp.goal ?? null,
        status: sp.status ?? 'planned',
        startDate: sp.startDate ?? null,
        endDate: sp.endDate ?? null,
        completedAt: sp.completedAt ? new Date(sp.completedAt).toISOString() : null,
      })),
      members: members
        .filter((m) => m.user?.email)
        .map((m) => ({
          userEmail: m.user.email,
          displayName: m.user.displayName ?? m.user.email,
          role: m.role ?? 'member',
        })),
      issues: issues.map((i) => ({
        sourceId: i.id,
        sourceKey: i.key ?? '',
        number: i.number ?? 0,
        title: i.title ?? '',
        description: i.description ?? null,
        type: i.type ?? 'task',
        priority: i.priority ?? 'medium',
        statusSourceId: i.statusId ?? null,
        statusName: i.status?.name ?? '',
        statusCategory: (i.status?.category ?? 'todo') as 'todo' | 'in_progress' | 'done',
        sprintSourceId: i.sprintId ?? null,
        sprintName: i.sprint?.name ?? null,
        parentSourceId: i.parentId ?? null,
        assigneeEmail: i.assignee?.email ?? null,
        reporterEmail: i.reporter?.email ?? '',
        storyPoints: i.storyPoints != null ? Number(i.storyPoints) : null,
        timeEstimate: i.timeEstimate ?? null,
        timeSpent: i.timeSpent ?? 0,
        dueDate: i.dueDate ?? null,
        labels: i.labels ?? [],
        position: i.position ?? 0,
        createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: i.updatedAt ? new Date(i.updatedAt).toISOString() : new Date().toISOString(),
      })),
      comments: comments.map((c) => ({
        sourceId: c.id,
        issueSourceId: c.issueId,
        authorEmail: c.author?.email ?? '',
        content: c.content ?? '',
        createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
      })),
      customFieldDefinitions: fieldDefs.map((f) => ({
        sourceId: f.id,
        name: f.name ?? '',
        fieldKey: f.fieldKey ?? '',
        fieldType: f.fieldType ?? 'text',
        description: f.description ?? null,
        isRequired: f.isRequired ?? false,
        defaultValue: f.defaultValue ?? null,
        options: f.options ?? null,
        position: f.position ?? 0,
      })),
      customFieldValues: fieldValues
        .map((fv) => {
          const fieldKey = fv.field?.fieldKey ?? fieldKeyById.get(fv.fieldId);
          if (!fieldKey) return null;
          return { issueSourceId: fv.issueId, fieldKey, value: fv.value };
        })
        .filter((v): v is NonNullable<typeof v> => v != null),
      components: components.map((c) => ({
        sourceId: c.id,
        name: c.name ?? '',
        description: c.description ?? null,
        leadEmail: c.lead?.email ?? null,
      })),
      versions: versions.map((v) => ({
        sourceId: v.id,
        name: v.name ?? '',
        description: v.description ?? null,
        status: v.status ?? 'unreleased',
        startDate: v.startDate ?? null,
        releaseDate: v.releaseDate ?? null,
        releasedAt: v.releasedAt ? new Date(v.releasedAt).toISOString() : null,
      })),
      issueComponents: issueComponents.map((ic) => ({
        issueSourceId: ic.issueId,
        componentSourceId: ic.componentId,
      })),
      issueVersions: issueVersions.map((iv) => ({
        issueSourceId: iv.issueId,
        versionSourceId: iv.versionId,
        relationType: iv.relationType ?? 'fix',
      })),
      attachments: attachments.map((a) => ({
        sourceId: a.portabilitySourceId ?? a.id,
        issueSourceId: a.issueId ?? '',
        commentSourceId: a.commentId ?? null,
        uploaderEmail: a.uploader?.email ?? '',
        fileName: a.fileName ?? '',
        fileSize: Number(a.fileSize ?? 0),
        mimeType: a.mimeType ?? 'application/octet-stream',
        storageKey: a.storageKey ?? '',
        storageBucket: a.storageBucket ?? '',
        createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : new Date().toISOString(),
      })),
      issueLinks: issueLinks
        .filter((l) => issueIds.includes(l.sourceIssueId) && issueIds.includes(l.targetIssueId))
        .map((l) => ({
          sourceId: l.id,
          sourceIssueSourceId: l.sourceIssueId,
          targetIssueSourceId: l.targetIssueId,
          linkType: l.linkType ?? 'relates_to',
          createdByEmail: l.creator?.email ?? '',
          createdAt: l.createdAt ? new Date(l.createdAt).toISOString() : new Date().toISOString(),
        })),
      issueWatchers: issueWatchers
        .filter((w) => w.user?.email)
        .map((w) => ({
          issueSourceId: w.issueId,
          userEmail: w.user.email,
          createdAt: w.createdAt ? new Date(w.createdAt).toISOString() : new Date().toISOString(),
        })),
      workLogs: workLogs
        .filter((wl) => wl.user?.email)
        .map((wl) => ({
          sourceId: wl.id,
          issueSourceId: wl.issueId,
          userEmail: wl.user.email,
          timeSpent: wl.timeSpent ?? 0,
          description: wl.description ?? null,
          loggedAt: wl.loggedAt ? new Date(wl.loggedAt).toISOString() : new Date().toISOString(),
          createdAt: wl.createdAt ? new Date(wl.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: wl.updatedAt ? new Date(wl.updatedAt).toISOString() : new Date().toISOString(),
        })),
    };
  }
}
