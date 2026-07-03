import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Project } from '@/modules/projects/entities/project.entity';
import { memberSearchDocumentId } from '@/modules/search/search-index.constants';

export interface ProjectSearchDocument {
  id: string;
  organizationId: string;
  key: string;
  name: string;
  type: string;
  color?: string;
  iconUrl?: string;
  status: string;
  updatedAt: Date | string;
}

@Injectable()
export class SearchIndexQueueService {
  private readonly logger = new Logger(SearchIndexQueueService.name);

  constructor(
    @InjectQueue('search-index')
    private readonly searchIndexQueue: Queue,
  ) {}

  buildProjectDocument(project: Project): ProjectSearchDocument {
    return {
      id: project.id,
      organizationId: project.organizationId,
      key: project.key,
      name: project.name,
      type: project.type,
      color: project.color ?? undefined,
      iconUrl: project.iconUrl ?? undefined,
      status: project.status,
      updatedAt: project.updatedAt,
    };
  }

  async indexProject(project: Project): Promise<void> {
    if (project.status === 'archived') {
      await this.deleteProject(project.id);
      return;
    }
    await this.enqueue('index-project', {
      project: this.buildProjectDocument(project),
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.enqueue('delete-project', { projectId });
  }

  async refreshMember(organizationId: string, userId: string): Promise<void> {
    await this.enqueue('refresh-member', { organizationId, userId });
  }

  async deleteMember(organizationId: string, userId: string): Promise<void> {
    await this.enqueue('delete-member', {
      organizationId,
      userId,
      documentId: memberSearchDocumentId(organizationId, userId),
    });
  }

  private async enqueue(jobName: string, data: Record<string, unknown>): Promise<void> {
    try {
      await this.searchIndexQueue.add(jobName, data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to enqueue search job "${jobName}": ${message}`);
    }
  }
}
