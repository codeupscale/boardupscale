import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Issue } from '@/modules/issues/entities/issue.entity';
import { Project } from '@/modules/projects/entities/project.entity';
import { ProjectKeyAlias } from '@/modules/projects/entities/project-key-alias.entity';
import { ProjectMember } from '@/modules/projects/entities/project-member.entity';
import { User } from '@/modules/users/entities/user.entity';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { SearchController } from '@/modules/search/search.controller';
import { SearchService } from '@/modules/search/search.service';
import { SearchIndexQueueService } from '@/modules/search/search-index-queue.service';
import { SearchReindexService } from '@/modules/search/search-reindex.service';
import { SearchReindexController } from '@/modules/search/search-reindex.controller';
import { SearchReindexJob } from '@/modules/search/entities/search-reindex-job.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Issue,
      Project,
      ProjectMember,
      User,
      ProjectKeyAlias,
      SearchReindexJob,
    ]),
    BullModule.registerQueue({ name: 'search-index' }),
    PermissionsModule,
  ],
  controllers: [SearchController, SearchReindexController],
  providers: [SearchService, SearchIndexQueueService, SearchReindexService],
  exports: [SearchService, SearchIndexQueueService, SearchReindexService],
})
export class SearchModule {}
