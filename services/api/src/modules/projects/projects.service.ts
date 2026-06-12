import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
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
import { PosthogService } from '../telemetry/posthog.service';
import { SearchService } from '../search/search.service';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
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
    private searchService: SearchService,
  ) {}

  /**
   * Issue keys are bulk-updated in SQL on project key rename, bypassing IssuesService
   * which normally enqueues per-issue index jobs. Reindex the whole project instead.
   */
  private async enqueueSearchReindex(projectId: string, organizationId: string): Promise<void> {
    try {
      await this.searchService.reindexProject(projectId, organizationId);
    } catch (err: any) {
      this.logger.warn(
        `Failed to enqueue search reindex for project ${projectId} after key change: ${err.message}`,
      );
    }
  }

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
  ): Promise<{ items: Project[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));

    const qb = this.projectRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.owner', 'owner')
      .where('project.organizationId = :organizationId', { organizationId })
      .andWhere('project.status != :archived', { archived: 'archived' })
      .orderBy('project.createdAt', 'DESC');

    // O21: Owner and Administrator bypass project membership — they see all projects.
    // Everyone else can only see projects where they have an explicit membership row.
    const isOrgAdmin = orgRole === 'owner' || orgRole === 'administrator';
    if (!isOrgAdmin) {
      qb.innerJoin(
        'project_members',
        'pm',
        'pm.project_id = project.id AND pm.user_id = :userId',
        { userId },
      );
    }

    if (options?.search) {
      qb.andWhere(
        '(project.name ILIKE :search OR project.key ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const total = await qb.getCount();
    const items = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { items, total, page, limit };
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
    const existing = await this.projectRepository.findOne({
      where: { key: dto.key, organizationId },
    });
    if (existing) {
      throw new ConflictException(`Project key "${dto.key}" is already taken in this organization`);
    }

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
      this.issueStatusRepository.create({ ...s, projectId: saved.id }),
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
    const prevValues = { name: project.name, key: project.key, description: project.description };

    const normalizedKey = dto.key?.toUpperCase();
    const keyChanging = normalizedKey !== undefined && normalizedKey !== project.key;

    if (keyChanging) {
      const existing = await this.projectRepository.findOne({
        where: { key: normalizedKey, organizationId },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Project key "${normalizedKey}" is already taken in this organization`,
        );
      }
    }

    const applyUpdates = () => {
      if (dto.name !== undefined) project.name = dto.name;
      if (dto.description !== undefined) project.description = dto.description;
      if (dto.status !== undefined) project.status = dto.status;
      if (dto.color !== undefined) project.color = dto.color;
      if (dto.iconUrl !== undefined) project.iconUrl = dto.iconUrl;
      if (normalizedKey !== undefined) project.key = normalizedKey;
    };

    if (keyChanging) {
      await this.projectRepository.manager.transaction(async (em) => {
        applyUpdates();
        await em.save(Project, project);
        await em.query(
          `UPDATE issues SET key = $1 || '-' || number::text, updated_at = NOW()
           WHERE project_id = $2 AND organization_id = $3`,
          [normalizedKey, id, organizationId],
        );
      });
    } else {
      applyUpdates();
      await this.projectRepository.save(project);
    }

    const saved = await this.findById(id, organizationId);

    if (keyChanging) {
      await this.enqueueSearchReindex(id, organizationId);
    }

    this.auditService.log(organizationId, userId || null, 'project.updated', 'project', id, {
      previous: prevValues,
      updated: dto,
      ...(keyChanging ? { keyChanged: { from: prevValues.key, to: normalizedKey } } : {}),
    });

    return saved;
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
    return this.projectMemberRepository.save(member);
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
