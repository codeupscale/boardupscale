import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { DataSource } from 'typeorm';
import { Project } from '../../modules/projects/entities/project.entity';
import { ProjectKeyAlias } from '../../modules/projects/entities/project-key-alias.entity';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Intercepts incoming requests and resolves `projectId` in the body
 * from a project key (e.g. "LIN") to a UUID, if needed.
 *
 * This allows endpoints that accept projectId in the body to work
 * seamlessly with both UUIDs and project keys.
 */
@Injectable()
export class ResolveProjectBodyInterceptor implements NestInterceptor {
  constructor(private dataSource: DataSource) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const body = request.body;

    if (typeof body?.projectId === 'string' && !UUID_REGEX.test(body.projectId)) {
      // Project keys are only unique per org — always scope to the caller's
      // active org so a key can never resolve to another tenant's project.
      const organizationId = request.user?.organizationId;
      if (!organizationId) {
        throw new NotFoundException(`Project "${body.projectId}" not found`);
      }

      const normalized = body.projectId.toUpperCase();
      const project = await this.dataSource.getRepository(Project).findOne({
        where: { key: normalized, organizationId },
        select: ['id'],
      });
      const projectId =
        project?.id ??
        (
          await this.dataSource.getRepository(ProjectKeyAlias).findOne({
            where: { oldKey: normalized, organizationId },
            select: ['projectId'],
          })
        )?.projectId;

      if (!projectId) {
        throw new NotFoundException(`Project "${body.projectId}" not found`);
      }

      body.projectId = projectId;
    }

    return next.handle();
  }
}
