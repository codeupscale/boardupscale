import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { Issue } from '../issues/entities/issue.entity';
import { Comment } from '../comments/entities/comment.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { User } from '../users/entities/user.entity';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiUsageLog, Issue, Comment, Sprint, User]),
    BullModule.registerQueue({ name: 'ai' }),
    PermissionsModule,
  ],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
