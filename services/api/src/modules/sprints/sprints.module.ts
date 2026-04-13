import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';
import { Sprint } from './entities/sprint.entity';
import { Issue } from '../issues/entities/issue.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { ProjectsModule } from '../projects/projects.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AutomationModule } from '../automation/automation.module';
import { EventsModule } from '../../websocket/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sprint, Issue, IssueStatus]),
    ProjectsModule,
    NotificationsModule,
    PermissionsModule,
    WebhooksModule,
    forwardRef(() => AutomationModule),
    EventsModule,
  ],
  controllers: [SprintsController],
  providers: [SprintsService],
  exports: [SprintsService],
})
export class SprintsModule {}
