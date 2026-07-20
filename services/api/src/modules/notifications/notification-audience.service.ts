import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IssueWatcher } from '../issues/entities/issue-watcher.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';

/** Project roles that count as project admin (includes legacy strings). */
const PROJECT_ADMIN_ROLES = ['admin', 'owner', 'manager'] as const;

const ORG_ADMIN_ROLES = ['owner', 'administrator'] as const;

/**
 * Resolves dynamic recipient sets for notifications.
 *
 * Product rules:
 * - Ticket created → creator + project admins (+ assignee if set)
 * - Status / priority change → assignee + reporter + watchers
 * - Sprint start/complete → all project members
 * - Org roles alone never grant project ticket noise; assign/mention/project-membership do
 * - Mentions are scoped to members of that project
 */
@Injectable()
export class NotificationAudienceService {
  constructor(
    @InjectRepository(IssueWatcher)
    private readonly watcherRepo: Repository<IssueWatcher>,
    @InjectRepository(ProjectMember)
    private readonly projectMemberRepo: Repository<ProjectMember>,
    @InjectRepository(OrganizationMember)
    private readonly orgMemberRepo: Repository<OrganizationMember>,
  ) {}

  async getWatcherUserIds(issueId: string): Promise<string[]> {
    const watchers = await this.watcherRepo.find({
      where: { issueId },
      select: ['userId'],
    });
    return watchers.map((w) => w.userId);
  }

  /**
   * Batch version of `getWatcherUserIds()` to avoid N+1 queries.
   * Returns mapping: issueId -> array of watcher userIds.
   */
  async getWatcherUserIdsByIssueIds(
    issueIds: string[],
  ): Promise<Record<string, string[]>> {
    if (issueIds.length === 0) return {};

    const watchers = await this.watcherRepo.find({
      where: { issueId: In(issueIds) },
      select: ['issueId', 'userId'],
    });

    const map: Record<string, string[]> = {};
    for (const w of watchers) {
      if (!map[w.issueId]) map[w.issueId] = [];
      map[w.issueId].push(w.userId);
    }
    return map;
  }

  /**
   * Project admins for a specific project only.
   * Does NOT include org owners/admins who are not project members.
   */
  async getProjectAdminUserIds(projectId: string): Promise<string[]> {
    const members = await this.projectMemberRepo.find({
      where: { projectId, role: In([...PROJECT_ADMIN_ROLES]) },
      select: ['userId'],
    });
    return [...new Set(members.map((m) => m.userId))];
  }

  /** Org owners + administrators for org-level events (project delete, etc.). */
  async getOrgOwnerAdminUserIds(organizationId: string): Promise<string[]> {
    const members = await this.orgMemberRepo.find({
      where: { organizationId, role: In([...ORG_ADMIN_ROLES]) },
      select: ['userId'],
    });
    return [...new Set(members.map((m) => m.userId))];
  }

  async isProjectMember(projectId: string, userId: string): Promise<boolean> {
    const row = await this.projectMemberRepo.findOne({
      where: { projectId, userId },
      select: ['id'],
    });
    return !!row;
  }

  /** Filter candidate user IDs to those who are members of the project. */
  async filterToProjectMembers(projectId: string, userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const members = await this.projectMemberRepo.find({
      where: { projectId, userId: In(userIds) },
      select: ['userId'],
    });
    const allowed = new Set(members.map((m) => m.userId));
    return userIds.filter((id) => allowed.has(id));
  }

  async getIssueStakeholders(params: {
    issueId: string;
    assigneeId?: string | null;
    reporterId?: string | null;
    includeWatchers?: boolean;
  }): Promise<string[]> {
    const ids: Array<string | null | undefined> = [
      params.assigneeId,
      params.reporterId,
    ];
    if (params.includeWatchers !== false) {
      const watchers = await this.getWatcherUserIds(params.issueId);
      ids.push(...watchers);
    }
    return ids.filter((id): id is string => !!id);
  }

  /** All project members — used for sprint lifecycle notifications. */
  async getProjectMemberUserIds(projectId: string): Promise<string[]> {
    const members = await this.projectMemberRepo.find({
      where: { projectId },
      select: ['userId'],
    });
    return [...new Set(members.map((m) => m.userId))];
  }
}
