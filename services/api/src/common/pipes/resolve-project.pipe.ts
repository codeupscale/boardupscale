import { PipeTransform, Injectable, NotFoundException, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { Project } from '../../modules/projects/entities/project.entity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves a project identifier (UUID or key) to a UUID.
 * If the value is already a UUID, it passes through.
 * Otherwise, looks up the project by key SCOPED TO the requesting user's organization.
 */
@Injectable({ scope: Scope.REQUEST })
export class ResolveProjectPipe implements PipeTransform<string | undefined, Promise<string | undefined>> {
  constructor(
    private dataSource: DataSource,
    @Inject(REQUEST) private request: any,
  ) {}

  async transform(value: string | undefined): Promise<string | undefined> {
    if (!value) return value;

    if (UUID_REGEX.test(value)) {
      return value;
    }

    const organizationId = this.request?.user?.organizationId;
    const where: any = { key: value.toUpperCase() };
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const project = await this.dataSource.getRepository(Project).findOne({
      where,
      select: ['id'],
    });

    if (!project) {
      throw new NotFoundException(`Project "${value}" not found`);
    }

    return project.id;
  }
}
