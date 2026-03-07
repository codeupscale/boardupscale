import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { Comment } from './entities/comment.entity';
import { Issue } from '../issues/entities/issue.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { EventsModule } from '../../websocket/events.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment, Issue]),
    NotificationsModule,
    UsersModule,
    PermissionsModule,
    EventsModule,
    WebhooksModule,
    forwardRef(() => AutomationModule),
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
