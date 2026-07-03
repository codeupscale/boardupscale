import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Header,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { OrgId } from '@/common/decorators/org-id.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ResolveProjectPipe } from '@/common/pipes/resolve-project.pipe';
import { SearchReindexService } from '@/modules/search/search-reindex.service';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequirePermission('organization', 'manage-integrations')
@Controller('search/reindex')
export class SearchReindexController {
  constructor(private readonly searchReindexService: SearchReindexService) {}

  @Post(':projectId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Start a durable Elasticsearch reindex for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID or key' })
  async start(
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('projectId', ResolveProjectPipe) projectId: string,
  ) {
    const result = await this.searchReindexService.startReindex(
      projectId,
      organizationId,
      userId,
    );
    return {
      data: {
        jobId: result.jobId,
        projectId: result.projectId,
        message: 'Search reindex job enqueued',
      },
    };
  }

  @Get('status/:jobId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Poll search reindex job status (includes queue + stall hints)' })
  @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
  async getStatus(
    @OrgId() organizationId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    const data = await this.searchReindexService.getStatus(jobId, organizationId);
    return { data };
  }

  @Get('project/:projectId/latest')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get the latest reindex job for a project' })
  async getLatestForProject(
    @OrgId() organizationId: string,
    @Param('projectId', ResolveProjectPipe) projectId: string,
  ) {
    const data = await this.searchReindexService.getLatestForProject(projectId, organizationId);
    return { data };
  }

  @Post('retry/:jobId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Retry a failed or cancelled search reindex job' })
  async retry(
    @OrgId() organizationId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    const result = await this.searchReindexService.retry(jobId, organizationId);
    return { data: result };
  }

  @Post('cancel/:jobId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Cancel a pending or processing search reindex job' })
  async cancel(
    @OrgId() organizationId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    const result = await this.searchReindexService.cancel(jobId, organizationId);
    return { data: result };
  }
}
