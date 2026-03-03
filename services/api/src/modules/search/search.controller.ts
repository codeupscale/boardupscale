import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgId } from '../../common/decorators/org-id.decorator';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search issues using full-text search' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async search(
    @OrgId() organizationId: string,
    @Query('q') q: string,
    @Query('projectId') projectId?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: number,
  ) {
    const result = await this.searchService.search({
      q,
      organizationId,
      projectId,
      type,
      limit: limit ? Number(limit) : 20,
    });
    return {
      data: result.items,
      meta: { total: result.total },
    };
  }
}
