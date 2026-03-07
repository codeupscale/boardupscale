import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { TimesheetController } from './timesheet.controller';
import { ReportsService } from './reports.service';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Issue } from '../issues/entities/issue.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { WorkLog } from '../issues/entities/work-log.entity';
import { User } from '../users/entities/user.entity';
import { Project } from '../projects/entities/project.entity';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sprint, Issue, IssueStatus, WorkLog, User, Project]),
    ProjectsModule,
  ],
  controllers: [ReportsController, TimesheetController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
