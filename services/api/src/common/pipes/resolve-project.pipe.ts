import { PipeTransform, Injectable, NotFoundException, Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { DataSource } from 'typeorm';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves a project identifier (UUID or key) to a UUID.
 * If the value is already a UUID, it passes through.
 * Otherwise, looks up the project by current key or historical alias,
 * scoped to the requesting user's organization.
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
    if (!organizationId) {
      throw new NotFoundException(`Project "${value}" not found`);
    }

    const normalized = value.toUpperCase();
    const rows = await this.dataSource.query(
      `SELECT p.id
         FROM projects p
        WHERE p.organization_id = $1
          AND p.key = $2
        UNION ALL
       SELECT a.project_id AS id
         FROM project_key_aliases a
        WHERE a.organization_id = $1
          AND a.old_key = $2
        LIMIT 1`,
      [organizationId, normalized],
    );

    if (!rows?.length) {
      throw new NotFoundException(`Project "${value}" not found`);
    }

    return rows[0].id;
  }
}
