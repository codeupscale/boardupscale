import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';
import { JiraMigrationRun } from './entities/jira-migration-run.entity';

// Reuse from the existing import module
import { JiraConnection } from '../import/entities/jira-connection.entity';
import { JiraApiService } from '../import/jira-api.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([JiraMigrationRun, JiraConnection]),
    BullModule.registerQueue({ name: 'jira-migration' }),
  ],
  controllers: [MigrationController],
  providers: [MigrationService, JiraApiService],
  exports: [MigrationService],
})
export class MigrationModule {}
