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
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';

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
      ...dto,
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

    const defaultStatuses = [
      { name: 'To Do', category: 'todo', color: '#6B7280', position: 0, isDefault: true },
      { name: 'In Progress', category: 'in_progress', color: '#3B82F6', position: 1, isDefault: false },
      { name: 'In Review', category: 'in_progress', color: '#F59E0B', position: 2, isDefault: false },
      { name: 'Done', category: 'done', color: '#10B981', position: 3, isDefault: false },
    ];

    const statusEntities = defaultStatuses.map((s) =>
      this.issueStatusRepository.create({ ...s, projectId: saved.id }),
    );
    await this.issueStatusRepository.save(statusEntities);

    return saved;
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
