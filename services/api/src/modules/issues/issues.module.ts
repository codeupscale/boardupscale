import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { Issue } from './entities/issue.entity';
import { IssueStatus } from './entities/issue-status.entity';
import { WorkLog } from './entities/work-log.entity';
import { ProjectsModule } from '../projects/projects.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsModule } from '../../websocket/events.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Issue, IssueStatus, WorkLog]),
    ProjectsModule,
    NotificationsModule,
    EventsModule,
    forwardRef(() => AutomationModule),
  ],
  controllers: [IssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
