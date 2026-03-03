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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IssuesService } from './issues.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { CreateWorkLogDto } from './dto/create-work-log.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('issues')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('issues')
export class IssuesController {
  constructor(private issuesService: IssuesService) {}

  @Get()
  @ApiOperation({ summary: 'List issues with filters' })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'sprintId', required: false })
  @ApiQuery({ name: 'assigneeId', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'statusId', required: false })
  @ApiQuery({ name: 'search', required: false })
  async findAll(
    @OrgId() organizationId: string,
    @Query() pagination: PaginationDto,
    @Query('projectId') projectId?: string,
    @Query('sprintId') sprintId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('type') type?: string,
    @Query('priority') priority?: string,
    @Query('statusId') statusId?: string,
    @Query('search') search?: string,
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
  @ApiOperation({ summary: 'Create a new issue' })
  async create(
    @Body() dto: CreateIssueDto,
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
  ) {
    return this.issuesService.create(dto, organizationId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get issue by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    return this.issuesService.findById(id, organizationId);
  }

  @Patch(':id')
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
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete an issue' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    await this.issuesService.softDelete(id, organizationId);
  }

  @Post(':id/watch')
  @ApiOperation({ summary: 'Watch an issue' })
  async watch(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
  ) {
    return this.issuesService.addWatcher(id, organizationId, user.id);
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
