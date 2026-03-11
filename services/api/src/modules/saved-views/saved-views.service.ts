import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavedView } from './entities/saved-view.entity';
import { CreateSavedViewDto } from './dto/create-saved-view.dto';
import { UpdateSavedViewDto } from './dto/update-saved-view.dto';

@Injectable()
export class SavedViewsService {
  constructor(
    @InjectRepository(SavedView)
    private readonly repo: Repository<SavedView>,
  ) {}

  async findAll(projectId: string, organizationId: string, userId: string): Promise<SavedView[]> {
    return this.repo.find({
      where: [
        { projectId, organizationId, isShared: true },
        { projectId, organizationId, creatorId: userId },
      ],
      order: { createdAt: 'ASC' },
      relations: ['creator'],
    });
  }

  async create(
    projectId: string,
    organizationId: string,
    userId: string,
    dto: CreateSavedViewDto,
  ): Promise<SavedView> {
    const view = this.repo.create({
      projectId,
      organizationId,
      creatorId: userId,
      name: dto.name,
      filters: dto.filters,
      isShared: dto.isShared ?? false,
    });
    return this.repo.save(view);
  }

  async update(id: string, organizationId: string, userId: string, dto: UpdateSavedViewDto): Promise<SavedView> {
    const view = await this.repo.findOne({ where: { id, organizationId } });
    if (!view) throw new NotFoundException('Saved view not found');
    if (view.creatorId !== userId) throw new ForbiddenException('Only the creator can edit this view');

    Object.assign(view, dto);
    return this.repo.save(view);
  }

  async remove(id: string, organizationId: string, userId: string): Promise<void> {
    const view = await this.repo.findOne({ where: { id, organizationId } });
    if (!view) throw new NotFoundException('Saved view not found');
    if (view.creatorId !== userId) throw new ForbiddenException('Only the creator can delete this view');
    await this.repo.remove(view);
  }
}
