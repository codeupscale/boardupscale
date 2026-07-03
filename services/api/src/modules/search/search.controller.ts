import { Controller, Get, Post, Query, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { OrgId } from '@/common/decorators/org-id.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ResolveProjectPipe } from '@/common/pipes/resolve-project.pipe';
import { SearchService } from '@/modules/search/search.service';
import { SearchReindexService } from '@/modules/search/search-reindex.service';
import {
  GlobalSearchQueryDto,
  SEARCH_PER_CATEGORY_DEFAULT,
} from '@/modules/search/dto/global-search-query.dto';
import {
  SearchSimilarQueryDto,
  SIMILAR_DEFAULT_LIMIT,
} from '@/modules/search/dto/search-similar-query.dto';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('search')
export class SearchController {
  constructor(
    private searchService: SearchService,
    private searchReindexService: SearchReindexService,
  ) {}

  @Get()
  @RequirePermission('search', 'read')
  @ApiOperation({
    summary:
      'Global search across issues, projects, and members (owner/admin: org-wide; others: member projects only)',
  })
  @ApiQuery({ name: 'projectId', required: false, description: 'Optional project scope (UUID or key)' })
  async search(
    @OrgId() organizationId: string,
    @CurrentUser() currentUser: any,
    @Query() query: GlobalSearchQueryDto,
    @Query('projectId', ResolveProjectPipe) projectId?: string,
  ) {
    const result = await this.searchService.search({
      q: query.q,
      organizationId,
      userId: currentUser.id,
      orgRole: currentUser.role,
      projectId,
      type: query.type,
      priority: query.priority,
      statusName: query.status,
      limit: query.limit ?? SEARCH_PER_CATEGORY_DEFAULT,
    });
    return {
      data: {
        issues: result.issues,
        projects: result.projects,
        members: result.members,
      },
      meta: {
        totals: result.totals,
        total: result.totals.issues + result.totals.projects + result.totals.members,
        source: result.source,
      },
    };
  }

  @Get('similar')
  @RequirePermission('search', 'read')
  @ApiOperation({ summary: 'Find similar/duplicate issues based on text (uses ES MLT with PostgreSQL fallback)' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Limit to a specific project (UUID or key)' })
  async findSimilar(
    @OrgId() organizationId: string,
    @CurrentUser() currentUser: any,
    @Query() query: SearchSimilarQueryDto,
    @Query('projectId', ResolveProjectPipe) projectId?: string,
  ) {
    const result = await this.searchService.findSimilar({
      text: query.text,
      organizationId,
      userId: currentUser.id,
      orgRole: currentUser.role,
      projectId,
      excludeIssueId: query.excludeIssueId,
      limit: query.limit ?? SIMILAR_DEFAULT_LIMIT,
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
  @RequirePermission('organization', 'manage-integrations')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Start durable Elasticsearch reindex for a project (alias for POST /search/reindex/:projectId)',
    deprecated: true,
  })
  @ApiParam({ name: 'projectId', description: 'Project ID to reindex' })
  async reindexProject(
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
}
