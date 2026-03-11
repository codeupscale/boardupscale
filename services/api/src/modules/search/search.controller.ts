import { Controller, Get, Post, Query, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search issues using full-text search (Elasticsearch with PostgreSQL fallback)' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status name' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async search(
    @OrgId() organizationId: string,
    @Query('q') q: string,
    @Query('projectId', ResolveProjectPipe) projectId?: string,
    @Query('type') type?: string,
    @Query('priority') priority?: string,
    @Query('status') statusName?: string,
    @Query('limit') limit?: number,
  ) {
    const result = await this.searchService.search({
      q,
      organizationId,
      projectId,
      type,
      priority,
      statusName,
      limit: limit ? Number(limit) : 20,
    });
    return {
      data: result.items,
      meta: {
        total: result.total,
        source: result.source,
      },
    };
  }

  @Get('similar')
  @ApiOperation({ summary: 'Find similar/duplicate issues based on text (uses ES MLT with PostgreSQL fallback)' })
  @ApiQuery({ name: 'text', required: true, description: 'Issue title/description text to find duplicates for' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Limit to a specific project' })
  @ApiQuery({ name: 'excludeIssueId', required: false, description: 'Issue ID to exclude (for existing issues)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findSimilar(
    @OrgId() organizationId: string,
    @Query('text') text: string,
    @Query('projectId', ResolveProjectPipe) projectId?: string,
    @Query('excludeIssueId') excludeIssueId?: string,
    @Query('limit') limit?: number,
  ) {
    const result = await this.searchService.findSimilar({
      text,
      organizationId,
      projectId,
      excludeIssueId,
      limit: limit ? Number(limit) : 5,
    });
    return {
      data: result.items,
      meta: {
        total: result.total,
        source: result.source,
      },
    };
  }

  @Post('reindex/:projectId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Trigger full reindex of a project\'s issues (admin only)' })
  @ApiParam({ name: 'projectId', description: 'Project ID to reindex' })
  async reindexProject(
    @OrgId() organizationId: string,
    @Param('projectId', ResolveProjectPipe) projectId: string,
  ) {
    await this.searchService.reindexProject(projectId, organizationId);
    return {
      data: {
        message: `Reindex job enqueued for project ${projectId}`,
        projectId,
      },
    };
  }
}
