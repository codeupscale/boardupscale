import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Component } from './entities/component.entity';
import { IssueComponent } from './entities/issue-component.entity';
import { CreateComponentDto } from './dto/create-component.dto';
import { UpdateComponentDto } from './dto/update-component.dto';

@Injectable()
export class ComponentsService {
  constructor(
    @InjectRepository(Component)
    private componentRepository: Repository<Component>,
    @InjectRepository(IssueComponent)
    private issueComponentRepository: Repository<IssueComponent>,
  ) {}

  async create(
    projectId: string,
    dto: CreateComponentDto,
  ): Promise<Component> {
    const existing = await this.componentRepository.findOne({
      where: { projectId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `A component named "${dto.name}" already exists in this project`,
      );
    }

    const component = this.componentRepository.create({
      projectId,
      ...dto,
    });
    return this.componentRepository.save(component);
  }

  async findAll(projectId: string): Promise<Component[]> {
    return this.componentRepository.find({
      where: { projectId },
      relations: ['lead'],
      order: { name: 'ASC' },
    });
  }

  async findById(id: string): Promise<Component> {
    const component = await this.componentRepository.findOne({
      where: { id },
      relations: ['lead'],
    });
    if (!component) {
      throw new NotFoundException('Component not found');
    }
    return component;
  }

  async update(id: string, dto: UpdateComponentDto): Promise<Component> {
    const component = await this.findById(id);
    Object.assign(component, dto);
    return this.componentRepository.save(component);
  }

  async delete(id: string): Promise<void> {
    const component = await this.findById(id);
    await this.componentRepository.remove(component);
  }

  async assignToIssue(issueId: string, componentId: string): Promise<void> {
    await this.findById(componentId);
    const existing = await this.issueComponentRepository.findOne({
      where: { issueId, componentId },
    });
    if (existing) return;

    const issueComponent = this.issueComponentRepository.create({
      issueId,
      componentId,
    });
    await this.issueComponentRepository.save(issueComponent);
  }

  async removeFromIssue(
    issueId: string,
    componentId: string,
  ): Promise<void> {
    await this.issueComponentRepository.delete({ issueId, componentId });
  }

  async getIssueComponents(issueId: string): Promise<Component[]> {
    const issueComponents = await this.issueComponentRepository.find({
      where: { issueId },
      relations: ['component', 'component.lead'],
    });
    return issueComponents.map((ic) => ic.component);
  }

  async setIssueComponents(
    issueId: string,
    componentIds: string[],
  ): Promise<Component[]> {
    // Remove all existing
    await this.issueComponentRepository.delete({ issueId });

    // Add new ones
    for (const componentId of componentIds) {
      const ic = this.issueComponentRepository.create({
        issueId,
        componentId,
      });
      await this.issueComponentRepository.save(ic);
    }

    return this.getIssueComponents(issueId);
  }
}
