import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { MessagingChannel } from './entities/messaging-channel.entity';
import { MessagingChannelMember } from './entities/messaging-channel-member.entity';
import { MessagingMessage } from './entities/messaging-message.entity';
import { PermissionsModule } from '../permissions/permissions.module';
import { EventsModule } from '../../websocket/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MessagingChannel,
      MessagingChannelMember,
      MessagingMessage,
    ]),
    PermissionsModule,
    EventsModule,
  ],
  controllers: [MessagingController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
