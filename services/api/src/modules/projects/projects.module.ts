import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Project, ProjectMember, IssueStatus])],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
