import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { IssuesService } from './issues.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { CreateWorkLogDto } from './dto/create-work-log.dto';
import { BulkUpdateIssuesDto } from './dto/bulk-update-issues.dto';
import { BulkMoveIssuesDto } from './dto/bulk-move-issues.dto';
import { BulkDeleteIssuesDto } from './dto/bulk-delete-issues.dto';
import { BulkTransitionIssuesDto } from './dto/bulk-transition-issues.dto';
import { CreateIssueLinkDto } from './dto/create-issue-link.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ResolveProjectBodyInterceptor } from '../../common/interceptors/resolve-project-body.interceptor';

@ApiTags('issues')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(ResolveProjectBodyInterceptor)
@Controller('issues')
export class IssuesController {
  constructor(private issuesService: IssuesService) {}

  @Get()
  @ApiOperation({ summary: 'List issues with filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of issues' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'sprintId', required: false })
  @ApiQuery({ name: 'assigneeId', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'statusId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'deleted', required: false })
  async findAll(
    @OrgId() organizationId: string,
    @Query() pagination: PaginationDto,
    @Query('projectId', ResolveProjectPipe) projectId?: string,
    @Query('sprintId') sprintId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('type') type?: string,
    @Query('priority') priority?: string,
    @Query('statusId') statusId?: string,
    @Query('search') search?: string,
    @Query('deleted') deleted?: string,
  ) {
    const result = await this.issuesService.findAll({
      organizationId,
      projectId,
      sprintId,
      assigneeId,
      type,
      priority,
      statusId,
      search,
      page: pagination.page,
      limit: pagination.limit,
      deleted: deleted === 'true',
    });
    return {
      data: result.items,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      },
    };
  }

  @Post()
  @RequirePermission('issue', 'create')
  @ApiOperation({ summary: 'Create a new issue' })
  @ApiResponse({ status: 201, description: 'Issue created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async create(
    @Body() dto: CreateIssueDto,
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
  ) {
    return this.issuesService.create(dto, organizationId, user.id);
  }

  @Patch('bulk-update')
  @RequirePermission('issue', 'update')
  @ApiOperation({ summary: 'Bulk update issues' })
  async bulkUpdate(
    @OrgId() organizationId: string,
    @Body() dto: BulkUpdateIssuesDto,
  ) {
    return this.issuesService.bulkUpdate(organizationId, dto);
  }

  @Post('bulk-move')
  @RequirePermission('issue', 'update')
  @ApiOperation({ summary: 'Bulk move issues to another project' })
  async bulkMove(
    @OrgId() organizationId: string,
    @Body() dto: BulkMoveIssuesDto,
  ) {
    return this.issuesService.bulkMove(organizationId, dto);
  }

  @Post('bulk-delete')
  @RequirePermission('issue', 'delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk soft-delete issues' })
  async bulkDelete(
    @OrgId() organizationId: string,
    @Body() dto: BulkDeleteIssuesDto,
  ) {
    return this.issuesService.bulkDelete(organizationId, dto);
  }

  @Post('bulk-restore')
  @RequirePermission('issue', 'update')
  @ApiOperation({ summary: 'Bulk restore soft-deleted issues' })
  async bulkRestore(
    @OrgId() organizationId: string,
    @Body() body: BulkDeleteIssuesDto,
  ) {
    return this.issuesService.bulkRestore(organizationId, body.issueIds);
  }

  @Post('bulk-transition')
  @RequirePermission('issue', 'update')
  @ApiOperation({ summary: 'Bulk transition issues to a new status' })
  async bulkTransition(
    @OrgId() organizationId: string,
    @Body() dto: BulkTransitionIssuesDto,
  ) {
    return this.issuesService.bulkTransition(organizationId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get issue by ID' })
  @ApiResponse({ status: 200, description: 'Issue found' })
  @ApiResponse({ status: 404, description: 'Issue not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    return this.issuesService.findById(id, organizationId);
  }

  @Patch(':id')
  @RequirePermission('issue', 'update')
  @ApiOperation({ summary: 'Update an issue' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateIssueDto,
  ) {
    return this.issuesService.update(id, organizationId, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('issue', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete an issue' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    await this.issuesService.softDelete(id, organizationId);
  }

  // ── Issue Links ──

  @Post(':id/links')
  @ApiOperation({ summary: 'Create an issue link' })
  async createLink(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateIssueLinkDto,
  ) {
    return this.issuesService.createLink(id, organizationId, dto, user.id);
  }

  @Get(':id/links')
  @ApiOperation({ summary: 'Get issue links' })
  async getLinks(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    const links = await this.issuesService.getLinks(id, organizationId);
    return { data: links };
  }

  @Delete(':id/links/:linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an issue link' })
  async deleteLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @OrgId() organizationId: string,
  ) {
    await this.issuesService.deleteLink(id, linkId, organizationId);
  }

  // ── Issue Watchers ──

  @Post(':id/watch')
  @ApiOperation({ summary: 'Toggle watch/unwatch an issue' })
  async toggleWatch(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
  ) {
    return this.issuesService.toggleWatch(id, organizationId, user.id);
  }

  @Get(':id/watchers')
  @ApiOperation({ summary: 'Get issue watchers' })
  async getWatchers(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    const result = await this.issuesService.getWatchers(id, organizationId);
    return { data: result };
  }

  @Get(':id/children')
  @ApiOperation({ summary: 'Get subtasks/children of an issue' })
  async getChildren(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    const children = await this.issuesService.getChildren(id, organizationId);
    return { data: children };
  }

  @Post(':id/work-log')
  @ApiOperation({ summary: 'Log work on an issue' })
  async createWorkLog(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateWorkLogDto,
  ) {
    return this.issuesService.createWorkLog(id, organizationId, dto, user.id);
  }

  @Get(':id/work-logs')
  @ApiOperation({ summary: 'Get work logs for an issue' })
  async getWorkLogs(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    const logs = await this.issuesService.getWorkLogs(id, organizationId);
    return { data: logs };
  }
}
