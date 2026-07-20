import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationAudienceService } from './notification-audience.service';
import { EmailService } from './email.service';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { IssueWatcher } from '../issues/entities/issue-watcher.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';
import { EventsModule } from '../../websocket/events.module';
import { NOTIFICATION_QUEUE } from './notification.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      User,
      IssueWatcher,
      ProjectMember,
      OrganizationMember,
    ]),
    BullModule.registerQueue({ name: 'email' }),
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
    EventsModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationAudienceService, EmailService],
  exports: [NotificationsService, NotificationAudienceService, EmailService],
})
export class NotificationsModule {}
