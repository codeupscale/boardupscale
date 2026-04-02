import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { Issue } from '../issues/entities/issue.entity';
import { Comment } from '../comments/entities/comment.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { User } from '../users/entities/user.entity';
import { Project } from '../projects/entities/project.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';
import { Page } from '../pages/entities/page.entity';
import { PermissionsModule } from '../permissions/permissions.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiUsageLog,
      ChatConversation,
      ChatMessage,
      Issue,
      Comment,
      Sprint,
      User,
      Project,
      ProjectMember,
      Page,
    ]),
    BullModule.registerQueue({ name: 'ai' }),
    PermissionsModule,
    SearchModule,
  ],
  controllers: [AiController, ChatController],
  providers: [AiService, ChatService],
  exports: [AiService],
})
export class AiModule {}
