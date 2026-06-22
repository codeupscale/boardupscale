import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ProjectPortabilityController } from './project-portability.controller';
import { ProjectPortabilityService } from './project-portability.service';
import { ProjectPortabilityExportService } from './project-portability-export.service';
import { ProjectPortabilityJob } from './entities/project-portability-job.entity';
import { Project } from '../projects/entities/project.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Issue } from '../issues/entities/issue.entity';
import { Comment } from '../comments/entities/comment.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';
import { CustomFieldDefinition } from '../custom-fields/entities/custom-field-definition.entity';
import { CustomFieldValue } from '../custom-fields/entities/custom-field-value.entity';
import { Component } from '../components/entities/component.entity';
import { Version } from '../versions/entities/version.entity';
import { Attachment } from '../files/entities/attachment.entity';
import { IssueLink } from '../issues/entities/issue-link.entity';
import { IssueWatcher } from '../issues/entities/issue-watcher.entity';
import { WorkLog } from '../issues/entities/work-log.entity';
import { IssueComponent } from '../components/entities/issue-component.entity';
import { IssueVersion } from '../versions/entities/issue-version.entity';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectPortabilityJob,
      Project,
      IssueStatus,
      Sprint,
      Issue,
      Comment,
      ProjectMember,
      CustomFieldDefinition,
      CustomFieldValue,
      Component,
      Version,
      Attachment,
      IssueLink,
      IssueWatcher,
      WorkLog,
      IssueComponent,
      IssueVersion,
    ]),
    BullModule.registerQueue({ name: 'project-portability' }),
    PermissionsModule,
  ],
  controllers: [ProjectPortabilityController],
  providers: [ProjectPortabilityService, ProjectPortabilityExportService],
  exports: [ProjectPortabilityService],
})
export class ProjectPortabilityModule {}
