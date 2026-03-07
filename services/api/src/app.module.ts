import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
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
import { ReportsModule } from './modules/reports/reports.module';
import { HealthModule } from './modules/health/health.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { CustomFieldsModule } from './modules/custom-fields/custom-fields.module';
import { ComponentsModule } from './modules/components/components.module';
import { VersionsModule } from './modules/versions/versions.module';
import { EventsModule } from './websocket/events.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AutomationModule } from './modules/automation/automation.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { ActivityModule } from './modules/activity/activity.module';
import { AuditModule } from './modules/audit/audit.module';

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
import { Permission } from './modules/permissions/entities/permission.entity';
import { Role } from './modules/permissions/entities/role.entity';
import { Webhook } from './modules/webhooks/entities/webhook.entity';
import { WebhookDelivery } from './modules/webhooks/entities/webhook-delivery.entity';
import { CustomFieldDefinition } from './modules/custom-fields/entities/custom-field-definition.entity';
import { CustomFieldValue } from './modules/custom-fields/entities/custom-field-value.entity';
import { Component } from './modules/components/entities/component.entity';
import { IssueComponent } from './modules/components/entities/issue-component.entity';
import { Version } from './modules/versions/entities/version.entity';
import { IssueVersion } from './modules/versions/entities/issue-version.entity';
import { AutomationRule } from './modules/automation/entities/automation-rule.entity';
import { AutomationLog } from './modules/automation/entities/automation-log.entity';
import { ApiKey } from './modules/api-keys/entities/api-key.entity';
import { IssueLink } from './modules/issues/entities/issue-link.entity';
import { IssueWatcher } from './modules/issues/entities/issue-watcher.entity';
import { Activity } from './modules/activity/activity.entity';
import { AuditLog } from './modules/audit/audit-log.entity';

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
          Permission,
          Role,
          Webhook,
          WebhookDelivery,
          CustomFieldDefinition,
          CustomFieldValue,
          Component,
          IssueComponent,
          Version,
          IssueVersion,
          AutomationRule,
          AutomationLog,
          ApiKey,
          IssueLink,
          IssueWatcher,
          Activity,
          AuditLog,
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

    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('redis.url');
        if (redisUrl) {
          try {
            const url = new URL(redisUrl);
            return {
              connection: {
                host: url.hostname,
                port: parseInt(url.port, 10) || 6379,
              },
            };
          } catch {
            // fall through to host/port
          }
        }
        return {
          connection: {
            host: configService.get<string>('redis.host'),
            port: configService.get<number>('redis.port'),
          },
        };
      },
      inject: [ConfigService],
    }),

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
    ReportsModule,
    SearchModule,
    HealthModule,
    PermissionsModule,
    CustomFieldsModule,
    ComponentsModule,
    VersionsModule,
    EventsModule,
    WebhooksModule,
    AutomationModule,
    ApiKeysModule,
    ActivityModule,
    AuditModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
