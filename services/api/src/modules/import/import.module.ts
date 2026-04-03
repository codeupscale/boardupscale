import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { JiraMapperService } from './jira-mapper.service';
import { JiraApiService } from './jira-api.service';
import { JiraConnectionService } from './jira-connection.service';
import { JiraImportJobService } from './jira-import-job.service';
import { JiraConnection } from './entities/jira-connection.entity';
import { JiraImportJob } from './entities/jira-import-job.entity';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { Issue } from '../issues/entities/issue.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { Project } from '../projects/entities/project.entity';
import { Comment } from '../comments/entities/comment.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Issue,
      IssueStatus,
      Project,
      Comment,
      Sprint,
      User,
      JiraConnection,
      JiraImportJob,
    ]),
    BullModule.registerQueue({ name: 'import' }),
    ProjectsModule,
    UsersModule,
    PermissionsModule,
  ],
  controllers: [ImportController],
  providers: [
    ImportService,
    JiraMapperService,
    JiraApiService,
    JiraConnectionService,
    JiraImportJobService,
  ],
  exports: [JiraConnectionService, JiraImportJobService],
})
export class ImportModule {}
