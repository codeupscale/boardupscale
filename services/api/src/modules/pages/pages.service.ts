import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Page } from './entities/page.entity';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto, MovePageDto } from './dto/update-page.dto';
import { EventsGateway } from '../../websocket/events.gateway';

export interface PageTreeNode extends Omit<Page, 'parentPage' | 'project' | 'organization' | 'creator' | 'lastEditor'> {
  children: PageTreeNode[];
  creatorName?: string;
  lastEditorName?: string;
}

@Injectable()
export class PagesService {
  private readonly logger = new Logger(PagesService.name);

  constructor(
    @InjectRepository(Page)
    private pageRepository: Repository<Page>,
    @InjectQueue('search-index')
    private searchIndexQueue: Queue,
    private eventsGateway: EventsGateway,
  ) {}

  // ─── Tree Query ────────────────────────────────────────────────────────────

  async findTree(projectId: string, orgId: string): Promise<PageTreeNode[]> {
    const pages = await this.pageRepository
      .createQueryBuilder('page')
      // Only select navigation fields — omit heavy content field
      .select([
        'page.id', 'page.title', 'page.icon', 'page.status',
        'page.position', 'page.parentPageId', 'page.projectId',
        'page.organizationId', 'page.creatorId', 'page.lastEditorId',
        'page.createdAt', 'page.updatedAt', 'page.deletedAt',
        // Safe user fields only (no passwordHash, no tokens)
        'creator.id', 'creator.displayName', 'creator.avatarUrl', 'creator.email',
        'lastEditor.id', 'lastEditor.displayName', 'lastEditor.avatarUrl', 'lastEditor.email',
      ])
      .leftJoin('page.creator', 'creator')
      .leftJoin('page.lastEditor', 'lastEditor')
      .where('page.project_id = :projectId', { projectId })
      .andWhere('page.organization_id = :orgId', { orgId })
      .andWhere('page.deleted_at IS NULL')
      .orderBy('page.parent_page_id', 'ASC', 'NULLS FIRST')
      .addOrderBy('page.position', 'ASC')
      .addOrderBy('page.created_at', 'ASC')
      .getMany();

    return this.buildTree(pages);
  }

  private buildTree(pages: Page[]): PageTreeNode[] {
    const map = new Map<string, PageTreeNode>();
    const roots: PageTreeNode[] = [];

    for (const p of pages) {
      const node: PageTreeNode = {
        ...p,
        children: [],
        creatorName: (p.creator as any)?.displayName,
        lastEditorName: (p.lastEditor as any)?.displayName,
      };
      map.set(p.id, node);
    }

    for (const node of map.values()) {
      if (node.parentPageId && map.has(node.parentPageId)) {
        map.get(node.parentPageId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  // ─── Single Page ──────────────────────────────────────────────────────────

  async findById(id: string, orgId: string): Promise<Page> {
    const page = await this.pageRepository
      .createQueryBuilder('page')
      .select([
        'page.id', 'page.title', 'page.icon', 'page.status',
        'page.position', 'page.parentPageId', 'page.projectId',
        'page.organizationId', 'page.creatorId', 'page.lastEditorId',
        'page.content', 'page.slug', 'page.coverImageUrl',
        'page.createdAt', 'page.updatedAt', 'page.deletedAt',
        // Safe user fields only
        'creator.id', 'creator.displayName', 'creator.avatarUrl', 'creator.email',
        'lastEditor.id', 'lastEditor.displayName', 'lastEditor.avatarUrl', 'lastEditor.email',
      ])
      .leftJoin('page.creator', 'creator')
      .leftJoin('page.lastEditor', 'lastEditor')
      .where('page.id = :id', { id })
      .andWhere('page.organization_id = :orgId', { orgId })
      .andWhere('page.deleted_at IS NULL')
      .getOne();

    if (!page) throw new NotFoundException(`Page ${id} not found`);
    return page;
  }

  // ─── Breadcrumb ancestors ─────────────────────────────────────────────────

  async findAncestors(id: string, orgId: string): Promise<{ id: string; title: string }[]> {
    const ancestors: { id: string; title: string }[] = [];
    let currentId: string | null = id;

    // Walk up the tree (max 10 levels to avoid infinite loop)
    for (let i = 0; i < 10 && currentId; i++) {
      const page = await this.pageRepository.findOne({
        where: { id: currentId, organizationId: orgId, deletedAt: IsNull() },
        select: ['id', 'title', 'parentPageId'],
      });
      if (!page) break;
      ancestors.unshift({ id: page.id, title: page.title });
      currentId = page.parentPageId;
    }

    return ancestors;
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(dto: CreatePageDto, orgId: string, userId: string): Promise<Page> {
    const title = dto.title || 'Untitled';
    const slug = await this.generateUniqueSlug(title, dto.projectId);

    // Get next position among siblings
    const siblingCount = await this.pageRepository.count({
      where: {
        projectId: dto.projectId,
        organizationId: orgId,
        parentPageId: dto.parentPageId ?? IsNull() as any,
        deletedAt: IsNull(),
      },
    });

    const page = this.pageRepository.create({
      projectId: dto.projectId,
      organizationId: orgId,
      parentPageId: dto.parentPageId || null,
      creatorId: userId,
      lastEditorId: userId,
      title,
      slug,
      content: dto.content || '',
      icon: dto.icon || null,
      coverImageUrl: dto.coverImageUrl || null,
      status: dto.status || 'draft',
      position: siblingCount,
    });

    const saved = await this.pageRepository.save(page);

    // Enqueue for search indexing
    await this.enqueueSearchIndex(saved);

    // Emit real-time event to project room
    this.eventsGateway.server
      .to(`project:${dto.projectId}`)
      .emit('page:created', { id: saved.id, projectId: saved.projectId, title: saved.title });

    this.logger.log(`Page created: ${saved.id} in project ${saved.projectId}`);
    return saved;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(id: string, orgId: string, dto: UpdatePageDto, userId: string): Promise<Page> {
    const page = await this.pageRepository.findOne({
      where: { id, organizationId: orgId, deletedAt: IsNull() },
    });
    if (!page) throw new NotFoundException(`Page ${id} not found`);

    // If title changed and no manual slug provided, regenerate slug
    if (dto.title && dto.title !== page.title) {
      page.slug = await this.generateUniqueSlug(dto.title, page.projectId, id);
    }

    Object.assign(page, {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.content !== undefined && { content: dto.content }),
      ...(dto.icon !== undefined && { icon: dto.icon }),
      ...(dto.coverImageUrl !== undefined && { coverImageUrl: dto.coverImageUrl }),
      ...(dto.status !== undefined && { status: dto.status }),
      lastEditorId: userId,
    });

    const updated = await this.pageRepository.save(page);

    // Re-index
    await this.enqueueSearchIndex(updated);

    // Emit real-time
    this.eventsGateway.server
      .to(`project:${page.projectId}`)
      .emit('page:updated', {
        id: updated.id,
        projectId: updated.projectId,
        title: updated.title,
        updatedAt: updated.updatedAt,
      });

    return updated;
  }

  // ─── Move (change parent / reorder) ──────────────────────────────────────

  async move(id: string, orgId: string, dto: MovePageDto, userId: string): Promise<Page> {
    const page = await this.pageRepository.findOne({
      where: { id, organizationId: orgId, deletedAt: IsNull() },
    });
    if (!page) throw new NotFoundException(`Page ${id} not found`);

    // Prevent circular reference: new parent can't be a descendant of this page
    if (dto.parentPageId) {
      const isDescendant = await this.isDescendant(dto.parentPageId, id, orgId);
      if (isDescendant) {
        throw new ForbiddenException('Cannot move page into one of its own descendants');
      }
    }

    page.parentPageId = dto.parentPageId !== undefined ? dto.parentPageId : page.parentPageId;
    if (dto.position !== undefined) page.position = dto.position;
    page.lastEditorId = userId;

    const updated = await this.pageRepository.save(page);

    this.eventsGateway.server
      .to(`project:${page.projectId}`)
      .emit('page:moved', { id: updated.id, projectId: updated.projectId });

    return updated;
  }

  // ─── Soft Delete ─────────────────────────────────────────────────────────

  async softDelete(id: string, orgId: string): Promise<void> {
    const page = await this.pageRepository.findOne({
      where: { id, organizationId: orgId, deletedAt: IsNull() },
    });
    if (!page) throw new NotFoundException(`Page ${id} not found`);

    page.deletedAt = new Date();
    await this.pageRepository.save(page);

    // Also soft-delete all children recursively
    await this.softDeleteChildren(id, orgId);

    this.eventsGateway.server
      .to(`project:${page.projectId}`)
      .emit('page:deleted', { id, projectId: page.projectId });

    this.logger.log(`Page soft-deleted: ${id}`);
  }

  private async softDeleteChildren(parentId: string, orgId: string): Promise<void> {
    const children = await this.pageRepository.find({
      where: { parentPageId: parentId, organizationId: orgId, deletedAt: IsNull() },
      select: ['id'],
    });

    for (const child of children) {
      await this.pageRepository.update({ id: child.id }, { deletedAt: new Date() });
      await this.softDeleteChildren(child.id, orgId);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async generateUniqueSlug(title: string, projectId: string, excludeId?: string): Promise<string> {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 100) || 'untitled';

    let slug = base;
    let counter = 1;

    while (true) {
      const qb = this.pageRepository
        .createQueryBuilder('page')
        .where('page.project_id = :projectId', { projectId })
        .andWhere('page.slug = :slug', { slug });

      if (excludeId) {
        qb.andWhere('page.id != :excludeId', { excludeId });
      }

      const existing = await qb.getOne();
      if (!existing) break;

      slug = `${base}-${counter}`;
      counter++;
    }

    return slug;
  }

  private async isDescendant(candidateId: string, ancestorId: string, orgId: string): Promise<boolean> {
    let currentId: string | null = candidateId;

    for (let i = 0; i < 20 && currentId; i++) {
      if (currentId === ancestorId) return true;
      const page = await this.pageRepository.findOne({
        where: { id: currentId, organizationId: orgId },
        select: ['parentPageId'],
      });
      currentId = page?.parentPageId ?? null;
    }

    return false;
  }

  private async enqueueSearchIndex(page: Page): Promise<void> {
    try {
      await this.searchIndexQueue.add('index-page', {
        page: {
          id: page.id,
          organizationId: page.organizationId,
          projectId: page.projectId,
          title: page.title,
          content: page.content,
          status: page.status,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
        },
      });
    } catch (err) {
      // Non-fatal — search index can be rebuilt
      this.logger.warn(`Failed to enqueue search index for page ${page.id}: ${err.message}`);
    }
  }
}
