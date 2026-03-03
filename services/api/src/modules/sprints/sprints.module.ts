import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';
import { Sprint } from './entities/sprint.entity';
import { Issue } from '../issues/entities/issue.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { ProjectsModule } from '../projects/projects.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sprint, Issue, IssueStatus]),
    ProjectsModule,
    forwardRef(() => AutomationModule),
  ],
  controllers: [SprintsController],
  providers: [SprintsService],
  exports: [SprintsService],
})
export class SprintsModule {}
