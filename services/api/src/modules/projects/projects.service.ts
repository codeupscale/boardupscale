import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { CreateProjectDto, ProjectTemplate } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { AuditService } from '../audit/audit.service';
import { PROJECT_TEMPLATES, BLANK_STATUSES } from './project-templates';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(ProjectMember)
    private projectMemberRepository: Repository<ProjectMember>,
    @InjectRepository(IssueStatus)
    private issueStatusRepository: Repository<IssueStatus>,
    private auditService: AuditService,
  ) {}

  /**
   * List projects: org owner/admin see every non-archived project in the org;
   * other roles only see projects they belong to (project_members).
   */
  async findAll(organizationId: string, userId: string, orgRole?: string): Promise<Project[]> {
    const qb = this.projectRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.owner', 'owner')
      .where('project.organization_id = :organizationId', { organizationId })
      .andWhere('project.status != :archived', { archived: 'archived' })
      .orderBy('project.created_at', 'DESC');

    const isOrgAdmin = orgRole === 'owner' || orgRole === 'admin';
    if (!isOrgAdmin) {
      qb.innerJoin('project_members', 'pm', 'pm.project_id = project.id AND pm.user_id = :userId', { userId });
    }

    return qb.getMany();
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
    const prevValues = { name: project.name, description: project.description };
    Object.assign(project, dto);
    const saved = await this.projectRepository.save(project);

    // Audit log for project update
    this.auditService.log(organizationId, userId || null, 'project.updated', 'project', id, {
      previous: prevValues,
      updated: dto,
    });

    return saved;
  }

  async archive(id: string, organizationId: string, userId?: string): Promise<void> {
    const project = await this.findById(id, organizationId);
    await this.projectRepository.update(project.id, { status: 'archived' });

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

  async addMember(projectId: string, organizationId: string, dto: AddMemberDto) {
    await this.findById(projectId, organizationId);
    const existing = await this.projectMemberRepository.findOne({
      where: { projectId, userId: dto.userId },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this project');
    }
    const member = this.projectMemberRepository.create({
      projectId,
      userId: dto.userId,
      role: dto.role || 'developer',
    });
    return this.projectMemberRepository.save(member);
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
