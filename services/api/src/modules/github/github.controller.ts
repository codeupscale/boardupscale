import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { GithubService } from './github.service';
import { ConnectGithubDto } from './dto/connect-github.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';

@ApiTags('github')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  @Post('projects/:projectId/github/connect')
  @RequirePermission('project', 'manage')
  @ApiOperation({ summary: 'Connect a GitHub repository to a project' })
  async connect(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @OrgId() organizationId: string,
    @Body() dto: ConnectGithubDto,
  ) {
    const connection = await this.githubService.connectRepo(
      projectId,
      organizationId,
      dto,
    );
    return { data: connection };
  }

  @Delete('projects/:projectId/github/disconnect')
  @RequirePermission('project', 'manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect GitHub repository from a project' })
  async disconnect(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @OrgId() organizationId: string,
  ) {
    await this.githubService.disconnectRepo(projectId, organizationId);
  }

  @Get('projects/:projectId/github/status')
  @ApiOperation({ summary: 'Get GitHub connection status for a project' })
  async status(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @OrgId() organizationId: string,
  ) {
    const connection = await this.githubService.getConnectionStatus(
      projectId,
      organizationId,
    );
    return { data: connection };
  }

  @Get('github/oauth/url')
  @ApiOperation({ summary: 'Get GitHub OAuth URL for repository access (repo scope)' })
  @ApiQuery({ name: 'redirectUri', required: true, description: 'Frontend callback URL' })
  async getOAuthUrl(@Query('redirectUri') redirectUri: string) {
    const url = this.githubService.getOAuthUrl(redirectUri);
    return { data: { url } };
  }

  @Post('github/oauth/exchange')
  @ApiOperation({ summary: 'Exchange GitHub OAuth code for token and list repositories' })
  async exchangeOAuthCode(
    @Body() body: { code: string; redirectUri: string },
  ) {
    const result = await this.githubService.exchangeCodeForRepos(body.code, body.redirectUri);
    return { data: result };
  }

  @Get('issues/:issueId/github-events')
  @ApiOperation({ summary: 'Get GitHub events linked to an issue' })
  async getEventsForIssue(
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @OrgId() organizationId: string,
  ) {
    const events = await this.githubService.getEventsForIssue(
      issueId,
      organizationId,
    );
    return { data: events };
  }

  @Post('projects/:projectId/github/verify-webhook')
  @ApiOperation({ summary: 'Verify the GitHub webhook is still active' })
  async verifyWebhook(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @OrgId() organizationId: string,
  ) {
    const connection = await this.githubService.getConnectionStatus(
      projectId,
      organizationId,
    );
    if (!connection) {
      return { data: { active: false, message: 'No connection found' } };
    }
    const active = await this.githubService.verifyWebhook(connection.id);
    return { data: { active } };
  }
}
