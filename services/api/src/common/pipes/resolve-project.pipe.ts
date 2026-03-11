import { PipeTransform, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Project } from '../../modules/projects/entities/project.entity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves a project identifier (UUID or key) to a UUID.
 * If the value is already a UUID, it passes through.
 * Otherwise, looks up the project by key and returns the UUID.
 */
@Injectable()
export class ResolveProjectPipe implements PipeTransform<string | undefined, Promise<string | undefined>> {
  constructor(private dataSource: DataSource) {}

  async transform(value: string | undefined): Promise<string | undefined> {
    if (!value) return value;

    if (UUID_REGEX.test(value)) {
      return value;
    }

    const project = await this.dataSource.getRepository(Project).findOne({
      where: { key: value.toUpperCase() },
      select: ['id'],
    });

    if (!project) {
      throw new NotFoundException(`Project "${value}" not found`);
    }

    return project.id;
  }
}
