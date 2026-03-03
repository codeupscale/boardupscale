import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { IssuesModule } from './modules/issues/issues.module';
import { BoardsModule } from './modules/boards/boards.module';
import { SprintsModule } from './modules/sprints/sprints.module';
import { CommentsModule } from './modules/comments/comments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { FilesModule } from './modules/files/files.module';
import { SearchModule } from './modules/search/search.module';
import { HealthModule } from './modules/health/health.module';
import { CustomFieldsModule } from './modules/custom-fields/custom-fields.module';
import { ComponentsModule } from './modules/components/components.module';
import { VersionsModule } from './modules/versions/versions.module';
import { EventsModule } from './websocket/events.module';

import { Organization } from './modules/organizations/entities/organization.entity';
import { User } from './modules/users/entities/user.entity';
import { RefreshToken } from './modules/auth/entities/refresh-token.entity';
import { Project } from './modules/projects/entities/project.entity';
import { ProjectMember } from './modules/projects/entities/project-member.entity';
import { IssueStatus } from './modules/issues/entities/issue-status.entity';
import { Sprint } from './modules/sprints/entities/sprint.entity';
import { Issue } from './modules/issues/entities/issue.entity';
import { Comment } from './modules/comments/entities/comment.entity';
import { Attachment } from './modules/files/entities/attachment.entity';
import { Notification } from './modules/notifications/entities/notification.entity';
import { WorkLog } from './modules/issues/entities/work-log.entity';
import { CustomFieldDefinition } from './modules/custom-fields/entities/custom-field-definition.entity';
import { CustomFieldValue } from './modules/custom-fields/entities/custom-field-value.entity';
import { Component } from './modules/components/entities/component.entity';
import { IssueComponent } from './modules/components/entities/issue-component.entity';
import { Version } from './modules/versions/entities/version.entity';
import { IssueVersion } from './modules/versions/entities/issue-version.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('database.url'),
        entities: [
          Organization,
          User,
          RefreshToken,
          Project,
          ProjectMember,
          IssueStatus,
          Sprint,
          Issue,
          Comment,
          Attachment,
          Notification,
          WorkLog,
          CustomFieldDefinition,
          CustomFieldValue,
          Component,
          IssueComponent,
          Version,
          IssueVersion,
        ],
        synchronize: false,
        logging: configService.get<string>('app.nodeEnv') === 'development',
        ssl: configService.get<string>('app.nodeEnv') === 'production'
          ? { rejectUnauthorized: false }
          : false,
      }),
      inject: [ConfigService],
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    AuthModule,
    UsersModule,
    OrganizationsModule,
    ProjectsModule,
    IssuesModule,
    BoardsModule,
    SprintsModule,
    CommentsModule,
    NotificationsModule,
    FilesModule,
    SearchModule,
    HealthModule,
    CustomFieldsModule,
    ComponentsModule,
    VersionsModule,
    EventsModule,
  ],
})
export class AppModule {}
