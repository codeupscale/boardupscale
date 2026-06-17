import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Project } from './entities/project.entity';
import { ProjectKeyAlias } from './entities/project-key-alias.entity';
import { ProjectMember } from './entities/project-member.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { PermissionsModule } from '../permissions/permissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { Organization } from '../organizations/entities/organization.entity';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, ProjectKeyAlias, ProjectMember, IssueStatus, Organization]),
    forwardRef(() => PermissionsModule),
    forwardRef(() => OrganizationsModule),
    NotificationsModule,
    UsersModule,
    ConfigModule,
    TelemetryModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
