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

    if (body?.projectId && !UUID_REGEX.test(body.projectId)) {
      const project = await this.dataSource.getRepository(Project).findOne({
        where: { key: body.projectId.toUpperCase() },
        select: ['id'],
      });

      if (!project) {
        throw new NotFoundException(
          `Project "${body.projectId}" not found`,
        );
      }

      body.projectId = project.id;
    }

    return next.handle();
  }
}
