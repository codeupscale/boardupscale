import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { Issue } from './entities/issue.entity';
import { IssueStatus } from './entities/issue-status.entity';
import { WorkLog } from './entities/work-log.entity';
import { IssueLink } from './entities/issue-link.entity';
import { IssueWatcher } from './entities/issue-watcher.entity';
import { ProjectsModule } from '../projects/projects.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { EventsModule } from '../../websocket/events.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AutomationModule } from '../automation/automation.module';
import { ActivityModule } from '../activity/activity.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Issue, IssueStatus, WorkLog, IssueLink, IssueWatcher]),
    BullModule.registerQueue({ name: 'search-index' }),
    ProjectsModule,
    NotificationsModule,
    UsersModule,
    PermissionsModule,
    EventsModule,
    WebhooksModule,
    forwardRef(() => AutomationModule),
    ActivityModule,
    AiModule,
  ],
  controllers: [IssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
