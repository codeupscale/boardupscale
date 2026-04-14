import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { AutomationEngineService } from './automation-engine.service';
import { AutomationRule } from './entities/automation-rule.entity';
import { AutomationLog } from './entities/automation-log.entity';
import { Issue } from '../issues/entities/issue.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { Comment } from '../comments/entities/comment.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AutomationRule,
      AutomationLog,
      Issue,
      IssueStatus,
      Comment,
    ]),
    BullModule.registerQueue({
      name: 'automation',
    }),
    NotificationsModule,
    PermissionsModule,
  ],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationEngineService],
  exports: [AutomationService, AutomationEngineService],
})
export class AutomationModule {}
