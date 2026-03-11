import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GithubController } from './github.controller';
import { GithubWebhookController } from './github-webhook.controller';
import { GithubService } from './github.service';
import { GitHubConnection } from './entities/github-connection.entity';
import { GitHubEvent } from './entities/github-event.entity';
import { Issue } from '../issues/entities/issue.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([GitHubConnection, GitHubEvent, Issue]),
  ],
  controllers: [GithubController, GithubWebhookController],
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}
