import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { HealthModule } from './modules/health/health.module';
import { EventsModule } from './websocket/events.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

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
import { Webhook } from './modules/webhooks/entities/webhook.entity';
import { WebhookDelivery } from './modules/webhooks/entities/webhook-delivery.entity';

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
          Webhook,
          WebhookDelivery,
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
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
        },
      }),
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
    SearchModule,
    HealthModule,
    EventsModule,
    WebhooksModule,
  ],
})
export class AppModule {}
