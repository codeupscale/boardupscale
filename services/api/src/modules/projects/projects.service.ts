import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { ProjectKeyAlias } from './entities/project-key-alias.entity';
import { ProjectMember } from './entities/project-member.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { CreateProjectDto, ProjectTemplate } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../notifications/email.service';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PROJECT_TEMPLATES, BLANK_STATUSES } from './project-templates';
import { resolveDefaultSprintHandoffPolicy } from '../../common/constants/sprint-handoff-policy';
import { SPRINT_PLANNING_ISSUE_TYPES } from '../../common/constants/sprint-planning-issue-types';
import { PosthogService } from '../telemetry/posthog.service';
import { hasOrgWideAccess } from '@/common/constants/org-roles';
import { ProjectListItem, toProjectListItem } from './project-list.types';
import { SearchIndexQueueService } from '@/modules/search/search-index-queue.service';
import { SearchReindexService } from '@/modules/search/search-reindex.service';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(ProjectKeyAlias)
    private projectKeyAliasRepository: Repository<ProjectKeyAlias>,
    @InjectRepository(ProjectMember)
    private projectMemberRepository: Repository<ProjectMember>,
    @InjectRepository(IssueStatus)
    private issueStatusRepository: Repository<IssueStatus>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    private auditService: AuditService,
    private emailService: EmailService,
    private usersService: UsersService,
    private organizationsService: OrganizationsService,
    private configService: ConfigService,
    private posthogService: PosthogService,
    private searchIndexQueueService: SearchIndexQueueService,
    private searchReindexService: SearchReindexService,
  ) {}

  /**
   * List projects visible to the calling org member.
   *
   * Owner: sees all non-archived projects in the org.
   * User (default org role): sees only projects where they have an explicit
   * project_members row — they have no implicit access to any project.
   */
  async findAll(
    organizationId: string,
    userId: string,
    orgRole?: string,
    options?: { search?: string; page?: number; limit?: number },
  ): Promise<{ items: ProjectListItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));

    const qb = this.buildVisibleProjectsQuery(organizationId, userId, orgRole, options?.search);

    const total = await qb.clone().getCount();

    const memberCountSubQuery = qb
      .subQuery()
      .select('COUNT(pm_count.id)')
      .from('project_members', 'pm_count')
      .where('pm_count.project_id = project.id')
      .getQuery();

    const issueCountSubQuery = qb
      .subQuery()
      .select('COUNT(issue_count.id)')
      .from('issues', 'issue_count')
      .where('issue_count.project_id = project.id')
      .andWhere('issue_count.organization_id = :organizationId')
      .andWhere('issue_count.deleted_at IS NULL')
      .andWhere('issue_count.type IN (:...planningIssueTypes)')
      .getQuery();

    const { entities, raw } = await qb
      .addSelect(`COALESCE((${memberCountSubQuery}), 0)`, 'memberCount')
      .addSelect(`COALESCE((${issueCountSubQuery}), 0)`, 'issueCount')
      .setParameter('planningIssueTypes', [...SPRINT_PLANNING_ISSUE_TYPES])
      .skip((page - 1) * limit)
      .take(limit)
      .getRawAndEntities();

    const items = entities.map((project, index) =>
      toProjectListItem(project, raw[index] ?? {}),
    );

    return { items, total, page, limit };
  }

  private buildVisibleProjectsQuery(
    organizationId: string,
    userId: string,
    orgRole: string | undefined,
    search?: string,
  ) {
    const qb = this.projectRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.owner', 'owner')
      .where('project.organizationId = :organizationId', { organizationId })
      .andWhere('project.status != :archived', { archived: 'archived' })
      .orderBy('project.createdAt', 'DESC');

    // O21: Owner and Administrator bypass project membership — they see all projects.
    // Everyone else can only see projects where they have an explicit membership row.
    if (!hasOrgWideAccess(orgRole)) {
      qb.innerJoin(
        'project_members',
        'pm',
        'pm.project_id = project.id AND pm.user_id = :userId',
        { userId },
      );
    }

    if (search) {
      qb.andWhere('(project.name ILIKE :search OR project.key ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    return qb;
  }

  async findById(id: string, organizationId: string): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id, organizationId },
      relations: ['owner'],
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  async create(dto: CreateProjectDto, organizationId: string, userId: string): Promise<Project> {
    await this.assertProjectKeyAvailable(dto.key, organizationId);

    const project = this.projectRepository.create({
      name: dto.name,
      key: dto.key,
      description: dto.description,
      type: dto.type,
      organizationId,
      ownerId: userId,
      status: 'active',
      nextIssueNumber: 1,
    });
    const saved = await this.projectRepository.save(project);

    const ownerMember = this.projectMemberRepository.create({
      projectId: saved.id,
      userId,
      role: 'admin',
    });
    await this.projectMemberRepository.save(ownerMember);

    // Resolve statuses from template or use default scrum
    const templateKey = dto.templateType || ProjectTemplate.SCRUM;
    const statuses = this.getStatusesForTemplate(templateKey);

    const statusEntities = statuses.map((s) =>
      this.issueStatusRepository.create({
        ...s,
        projectId: saved.id,
        sprintHandoffPolicy: resolveDefaultSprintHandoffPolicy(s.category, s.name),
      }),
    );
    await this.issueStatusRepository.save(statusEntities);

    // Audit log for project creation
    this.auditService.log(organizationId, userId, 'project.created', 'project', saved.id, {
      name: saved.name,
      key: saved.key,
    });

    // PostHog analytics
    this.posthogService.capture(userId, 'project_created', {
      projectId: saved.id,
      projectName: saved.name,
      projectKey: saved.key,
      projectType: saved.type,
      organizationId,
    });

    void this.searchIndexQueueService.indexProject(saved);
    void this.searchIndexQueueService.refreshMember(organizationId, userId);

    return saved;
  }

  /**
   * Create a project from a specific template.
   */
  async createFromTemplate(
    userId: string,
    organizationId: string,
    dto: CreateProjectDto,
  ): Promise<Project> {
    return this.create(dto, organizationId, userId);
  }

  /**
   * Get the list of available project templates.
   */
  getTemplates(): Array<{
    key: string;
    name: string;
    description: string;
    templateCategory: string;
    statusCount: number;
  }> {
    return Object.entries(PROJECT_TEMPLATES).map(([key, template]) => ({
      key,
      name: template.name,
      description: template.description,
      templateCategory: template.templateCategory,
      statusCount: template.statuses.length,
    }));
  }

  private getStatusesForTemplate(templateKey: string) {
    const template = PROJECT_TEMPLATES[templateKey];
    return template ? template.statuses : BLANK_STATUSES;
  }

  async update(id: string, organizationId: string, dto: UpdateProjectDto, userId?: string): Promise<Project> {
    const project = await this.findById(id, organizationId);
    const prevValues = {
      name: project.name,
      description: project.description,
      key: project.key,
    };

    if (dto.type !== undefined || (dto as any).templateType !== undefined) {
      throw new BadRequestException('Project type/template cannot be changed after creation');
    }

    const { key: newKey, ...mutableFields } = dto;
    const keyChanging = newKey !== undefined && newKey !== project.key;

    if (keyChanging) {
      await this.assertProjectKeyAvailable(newKey!, organizationId, id);
    }

    if (keyChanging) {
      const oldKey = project.key;

      await this.projectRepository.manager.transaction(async (em) => {
        await em.query(
          `SELECT id FROM projects WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
          [id, organizationId],
        );

        await em.query(
          `INSERT INTO project_key_aliases (organization_id, project_id, old_key)
           VALUES ($1, $2, $3)
           ON CONFLICT (organization_id, old_key) DO NOTHING`,
          [organizationId, id, oldKey],
        );

        const setClauses = ['key = $1', 'updated_at = NOW()'];
        const params: unknown[] = [newKey];
        let paramIndex = 2;

        if (mutableFields.name !== undefined) {
          setClauses.push(`name = $${paramIndex++}`);
          params.push(mutableFields.name);
        }
        if (mutableFields.description !== undefined) {
          setClauses.push(`description = $${paramIndex++}`);
          params.push(mutableFields.description);
        }
        if (mutableFields.status !== undefined) {
          setClauses.push(`status = $${paramIndex++}`);
          params.push(mutableFields.status);
        }
        if (mutableFields.color !== undefined) {
          setClauses.push(`color = $${paramIndex++}`);
          params.push(mutableFields.color);
        }
        if (mutableFields.iconUrl !== undefined) {
          setClauses.push(`icon_url = $${paramIndex++}`);
          params.push(mutableFields.iconUrl);
        }

        params.push(id, organizationId);
        await em.query(
          `UPDATE projects SET ${setClauses.join(', ')}
            WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}`,
          params,
        );

        await em.query(
          `UPDATE issues
              SET key = $1 || '-' || number::text,
                  updated_at = NOW()
            WHERE project_id = $2
              AND organization_id = $3`,
          [newKey, id, organizationId],
        );
      });

      this.auditService.log(organizationId, userId || null, 'project.key_changed', 'project', id, {
        previousKey: oldKey,
        newKey,
        previous: prevValues,
        updated: dto,
      });

      return this.syncProjectSearchAfterKeyChange(
        organizationId,
        await this.findById(id, organizationId),
        userId,
      );
    }

    Object.assign(project, mutableFields);
    const saved = await this.projectRepository.save(project);

    this.auditService.log(organizationId, userId || null, 'project.updated', 'project', id, {
      previous: prevValues,
      updated: dto,
    });

    return this.syncProjectSearchAfterUpdate(organizationId, saved);
  }

  /** Light index update for name/description changes — no issue re-keying. */
  private syncProjectSearchAfterUpdate(organizationId: string, project: Project): Project {
    void this.searchIndexQueueService.indexProject(project);
    return project;
  }

  /**
   * Full project + issues + members reindex after key rename.
   * Issues are bulk-updated in SQL; ES must be refreshed via reindex-project.
   */
  private syncProjectSearchAfterKeyChange(
    organizationId: string,
    project: Project,
    triggeredById?: string,
  ): Project {
    void this.searchReindexService.startReindex(project.id, organizationId, triggeredById);
    return project;
  }

  /**
   * Resolve a project UUID from a key or historical alias, scoped to the org.
   * Single source of truth for key → project id lookups.
   */
  async resolveProjectId(key: string, organizationId: string): Promise<string | null> {
    const normalized = key.toUpperCase();

    const project = await this.projectRepository.findOne({
      where: { key: normalized, organizationId },
      select: ['id'],
    });
    if (project) return project.id;

    const alias = await this.projectKeyAliasRepository.findOne({
      where: { oldKey: normalized, organizationId },
      select: ['projectId'],
    });
    return alias?.projectId ?? null;
  }

  /**
   * Ensure a project key is not used by another project or reserved as an alias.
   */
  async assertProjectKeyAvailable(
    key: string,
    organizationId: string,
    excludeProjectId?: string,
  ): Promise<void> {
    const normalized = key.toUpperCase();

    const existing = await this.projectRepository.findOne({
      where: { key: normalized, organizationId },
      select: ['id'],
    });
    if (existing && existing.id !== excludeProjectId) {
      throw new ConflictException(`Project key "${normalized}" is already taken in this organization`);
    }

    const reserved = await this.projectKeyAliasRepository.findOne({
      where: { oldKey: normalized, organizationId },
      select: ['projectId'],
    });
    if (reserved && reserved.projectId !== excludeProjectId) {
      throw new ConflictException(
        `Project key "${normalized}" is reserved by a previous project key and cannot be reused`,
      );
    }
  }

  async archive(id: string, organizationId: string, userId?: string): Promise<void> {
    const project = await this.findById(id, organizationId);
    const now = new Date();

    // Run in a transaction so the archive is atomic — if any step fails the
    // project stays active and no partial soft-deletes are persisted.
    await this.projectRepository.manager.transaction(async (em) => {
      // 1. Soft-delete all comments whose parent issue belongs to this project
      await em.query(
        `UPDATE comments
            SET deleted_at = $1
          WHERE deleted_at IS NULL
            AND issue_id IN (SELECT id FROM issues WHERE project_id = $2)`,
        [now, project.id],
      );

      // 2. Soft-delete all issues in this project
      await em.query(
        `UPDATE issues
            SET deleted_at = $1
          WHERE project_id = $2
            AND deleted_at IS NULL`,
        [now, project.id],
      );

      // 3. Mark the project archived
      await em.query(
        `UPDATE projects SET status = 'archived', updated_at = $1 WHERE id = $2`,
        [now, project.id],
      );
    });

    // Audit log for project archival
    this.auditService.log(organizationId, userId || null, 'project.archived', 'project', id, {
      name: project.name,
      key: project.key,
    });

    void this.searchIndexQueueService.deleteProject(project.id);
  }

  async getMembers(projectId: string, organizationId: string) {
    await this.findById(projectId, organizationId);
    return this.projectMemberRepository.find({
      where: { projectId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Invite someone to a project by email.
   *
   * - If the person is already in the org → add them to the project directly
   *   (same as addMember) and send a "you've been added to project" email.
   * - If the person is NOT in the org → call organizationsService.inviteMember()
   *   (reusing the exact same org-invite flow: token generation, email template).
   *   The project_members row is created immediately so when they accept the org
   *   invite they already have access.  No "project added" email is sent yet —
   *   they'll see the project on first login.
   */
  async inviteMemberByEmail(
    projectId: string,
    organizationId: string,
    dto: import('./dto/invite-project-member.dto').InviteProjectMemberDto,
    actorId: string,
  ) {
    const project = await this.findById(projectId, organizationId);
    const projectRole = (['admin', 'member', 'viewer'] as const).includes(dto.projectRole as any)
      ? dto.projectRole!
      : 'viewer';

    // Check if the user already exists in our DB
    const existingUser = await this.usersService.findByEmail(dto.email);

    if (existingUser) {
      // Check if already in org (via org membership or legacy users.organization_id)
      const alreadyInProject = await this.projectMemberRepository.findOne({
        where: { projectId, userId: existingUser.id },
      });
      if (alreadyInProject) {
        throw new ConflictException('User is already a member of this project');
      }

      // Add to org if not already a member (reuse org invite — handles membership row + email)
      const orgUser = await this.organizationsService.inviteMember(
        organizationId,
        { email: dto.email, displayName: dto.displayName, role: 'user', forceCreate: true },
        actorId,
      ).catch((err) => {
        // 409 = already in org — that's fine, we still need to add to project
        if (err?.status === 409 || err?.response?.statusCode === 409) return existingUser;
        throw err;
      });

      const member = this.projectMemberRepository.create({
        projectId,
        userId: orgUser.id,
        role: projectRole,
      });
      const saved = await this.projectMemberRepository.save(member);

      // Only notify if they already have an active account
      if (existingUser.invitationStatus === 'accepted') {
        this.sendProjectMemberEmail(orgUser.id, project, organizationId, actorId).catch((err) =>
          this.logger.warn(`Failed to send project-member-added email: ${err.message}`),
        );
      }

      void this.searchIndexQueueService.refreshMember(organizationId, orgUser.id);
      return saved;
    }

    // Person is not in DB at all — trigger full org invite (creates user + sends invite email)
    const invited = await this.organizationsService.inviteMember(
      organizationId,
      { email: dto.email, displayName: dto.displayName, role: 'user', forceCreate: true },
      actorId,
    );

    // Pre-create project membership so they land in the project on first login
    const member = this.projectMemberRepository.create({
      projectId,
      userId: invited.id,
      role: projectRole,
    });
    const savedInvite = await this.projectMemberRepository.save(member);
    void this.searchIndexQueueService.refreshMember(organizationId, invited.id);
    return savedInvite;
  }

  async addMember(projectId: string, organizationId: string, dto: AddMemberDto, actorId?: string) {
    const project = await this.findById(projectId, organizationId);
    const existing = await this.projectMemberRepository.findOne({
      where: { projectId, userId: dto.userId },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this project');
    }
    const member = this.projectMemberRepository.create({
      projectId,
      userId: dto.userId,
      role: dto.role || 'member',
    });
    const saved = await this.projectMemberRepository.save(member);

    // Send project-member-added email (non-blocking)
    this.sendProjectMemberEmail(dto.userId, project, organizationId, actorId).catch((err) => {
      this.logger.warn(`Failed to send project-member-added email: ${err.message}`);
    });

    void this.searchIndexQueueService.refreshMember(organizationId, dto.userId);

    return saved;
  }

  /**
   * Send email notification when a user is added to a project.
   */
  private async sendProjectMemberEmail(
    userId: string,
    project: Project,
    organizationId: string,
    actorId?: string,
  ): Promise<void> {
    const user = await this.usersService.findById(userId);
    const org = await this.organizationRepository.findOne({ where: { id: organizationId } });
    let addedByName = 'A team member';
    if (actorId) {
      try {
        const actor = await this.usersService.findById(actorId);
        addedByName = actor.displayName || actor.email;
      } catch {
        // actor not found — use default
      }
    }
    const frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3000';
    const projectUrl = `${frontendUrl}/projects/${project.id}/board`;

    await this.emailService.sendProjectMemberAddedEmail(
      user.email,
      user.displayName || user.email,
      addedByName,
      project.name,
      project.key,
      org?.name || 'your organization',
      projectUrl,
    );
  }

  async removeMember(projectId: string, organizationId: string, userId: string): Promise<void> {
    const project = await this.findById(projectId, organizationId);
    const member = await this.projectMemberRepository.findOne({
      where: { projectId, userId },
    });
    if (!member) {
      throw new NotFoundException('Member not found in project');
    }
    if (project.ownerId === userId) {
      throw new ForbiddenException('Cannot remove the project owner');
    }
    await this.projectMemberRepository.remove(member);
    void this.searchIndexQueueService.refreshMember(organizationId, userId);
  }

  async isMember(projectId: string, userId: string): Promise<boolean> {
    const member = await this.projectMemberRepository.findOne({
      where: { projectId, userId },
    });
    return !!member;
  }

  async getNextIssueNumber(projectId: string): Promise<number> {
    const project = await this.projectRepository.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    const num = project.nextIssueNumber;
    await this.projectRepository.update(projectId, { nextIssueNumber: num + 1 });
    return num;
  }
}
