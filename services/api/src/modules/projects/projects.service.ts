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

/** Definition for a project template with predefined statuses */
interface TemplateDefinition {
  name: string;
  description: string;
  statuses: Array<{
    name: string;
    category: string;
    color: string;
    position: number;
    isDefault: boolean;
  }>;
}

/** Registry of all available project templates */
const PROJECT_TEMPLATES: Record<string, TemplateDefinition> = {
  [ProjectTemplate.SCRUM]: {
    name: 'Scrum',
    description: 'Agile scrum workflow with sprints, backlog, and review stages',
    statuses: [
      { name: 'To Do', category: 'todo', color: '#6B7280', position: 0, isDefault: true },
      { name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 1, isDefault: false },
      { name: 'In Review', category: 'in_progress', color: '#F59E0B', position: 2, isDefault: false },
      { name: 'Done', category: 'done', color: '#10B981', position: 3, isDefault: false },
    ],
  },
  [ProjectTemplate.KANBAN]: {
    name: 'Kanban',
    description: 'Continuous flow Kanban board with backlog and review stages',
    statuses: [
      { name: 'Backlog', category: 'todo', color: '#9CA3AF', position: 0, isDefault: true },
      { name: 'To Do', category: 'todo', color: '#6B7280', position: 1, isDefault: false },
      { name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 2, isDefault: false },
      { name: 'Review', category: 'in_progress', color: '#F59E0B', position: 3, isDefault: false },
      { name: 'Done', category: 'done', color: '#10B981', position: 4, isDefault: false },
    ],
  },
  [ProjectTemplate.BUG_TRACKING]: {
    name: 'Bug Tracking',
    description: 'Bug lifecycle workflow from report to verification',
    statuses: [
      { name: 'Open', category: 'todo', color: '#EF4444', position: 0, isDefault: true },
      { name: 'Confirmed', category: 'todo', color: '#F97316', position: 1, isDefault: false },
      { name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 2, isDefault: false },
      { name: 'Fixed', category: 'in_progress', color: '#8B5CF6', position: 3, isDefault: false },
      { name: 'Verified', category: 'done', color: '#10B981', position: 4, isDefault: false },
      { name: 'Closed', category: 'done', color: '#6B7280', position: 5, isDefault: false },
    ],
  },
};

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(ProjectMember)
    private projectMemberRepository: Repository<ProjectMember>,
    @InjectRepository(IssueStatus)
    private issueStatusRepository: Repository<IssueStatus>,
  ) {}

  async findAll(organizationId: string, userId: string): Promise<Project[]> {
    return this.projectRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.owner', 'owner')
      .innerJoin('project_members', 'pm', 'pm.project_id = project.id AND pm.user_id = :userId', { userId })
      .where('project.organization_id = :organizationId', { organizationId })
      .andWhere('project.status != :archived', { archived: 'archived' })
      .orderBy('project.created_at', 'DESC')
      .getMany();
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
      role: 'owner',
    });
    await this.projectMemberRepository.save(ownerMember);

    // Resolve statuses from template or use default scrum
    const templateKey = dto.templateType || ProjectTemplate.SCRUM;
    const statuses = this.getStatusesForTemplate(templateKey);

    const statusEntities = statuses.map((s) =>
      this.issueStatusRepository.create({ ...s, projectId: saved.id }),
    );
    await this.issueStatusRepository.save(statusEntities);

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
    statusCount: number;
  }> {
    return Object.entries(PROJECT_TEMPLATES).map(([key, template]) => ({
      key,
      name: template.name,
      description: template.description,
      statusCount: template.statuses.length,
    }));
  }

  private getStatusesForTemplate(templateKey: string) {
    const template = PROJECT_TEMPLATES[templateKey];
    if (template) {
      return template.statuses;
    }
    // Blank template: minimal single status
    return [
      { name: 'To Do', category: 'todo', color: '#6B7280', position: 0, isDefault: true },
      { name: 'Done', category: 'done', color: '#10B981', position: 1, isDefault: false },
    ];
  }

  async update(id: string, organizationId: string, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.findById(id, organizationId);
    Object.assign(project, dto);
    return this.projectRepository.save(project);
  }

  async archive(id: string, organizationId: string): Promise<void> {
    const project = await this.findById(id, organizationId);
    await this.projectRepository.update(project.id, { status: 'archived' });
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
    await this.findById(projectId, organizationId);
    const member = await this.projectMemberRepository.findOne({
      where: { projectId, userId },
    });
    if (!member) {
      throw new NotFoundException('Member not found in project');
    }
    if (member.role === 'owner') {
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
