import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuditModule } from '../audit/audit.module';
import { BoardsModule } from '../boards/boards.module';
import { CommentsModule } from '../comments/comments.module';
import { FilesModule } from '../files/files.module';
import { GithubModule } from '../github/github.module';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { IssuesModule } from '../issues/issues.module';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';
import { PermissionsModule } from '../permissions/permissions.module';
import { ProjectsModule } from '../projects/projects.module';
import { SprintsModule } from '../sprints/sprints.module';
import { McpAccessService } from './mcp-access.service';
import { McpServerFactory } from './mcp-server.factory';
import { McpTokenGuard } from './mcp-token.guard';
import { McpTokensController } from './mcp-tokens.controller';
import { McpController } from './mcp.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationMember, IssueStatus]),
    ApiKeysModule,
    AuditModule,
    BoardsModule,
    CommentsModule,
    FilesModule,
    GithubModule,
    IssuesModule,
    PermissionsModule,
    ProjectsModule,
    SprintsModule,
  ],
  // Tokens controller first so /mcp/tokens is matched before /mcp.
  controllers: [McpTokensController, McpController],
  providers: [McpAccessService, McpServerFactory, McpTokenGuard],
})
export class McpModule {}
