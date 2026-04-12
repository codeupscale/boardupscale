import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
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
import { BoardsService } from './boards.service';
import { CreateStatusDto } from './dto/create-status.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ReorderIssuesDto } from './dto/reorder-issues.dto';
import { BoardQueryDto } from './dto/board-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';

@ApiTags('boards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects/:projectId')
export class BoardsController {
  constructor(private boardsService: BoardsService) {}

  @Get('board')
  @ApiOperation({ summary: 'Get board data for a project with optional filters' })
  @ApiQuery({ name: 'assigneeId', required: false, description: 'Filter by assignee' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by issue type' })
  @ApiQuery({ name: 'priority', required: false, description: 'Filter by priority' })
  @ApiQuery({ name: 'label', required: false, description: 'Filter by label' })
  @ApiQuery({ name: 'search', required: false, description: 'Search text in titles' })
  @ApiQuery({ name: 'sprintId', required: false, description: 'Filter by sprint (use "backlog" for unassigned)' })
  async getBoard(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @OrgId() organizationId: string,
    @Query() query: BoardQueryDto,
  ) {
    const board = await this.boardsService.getBoardData(projectId, organizationId, query);
    return { data: { statuses: board } };
  }

  @Get('board/columns/:statusId/issues')
  @ApiOperation({ summary: 'Load more issues for a specific board column (pagination)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Pagination offset' })
  @ApiQuery({ name: 'columnLimit', required: false, description: 'Number of issues to return' })
  async getColumnIssues(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @Param('statusId') statusId: string,
    @OrgId() organizationId: string,
    @Query() query: BoardQueryDto,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    const result = await this.boardsService.getColumnIssues(projectId, statusId, organizationId, query, offset);
    return { data: result };
  }

  @Post('statuses')
  @RequirePermission('board', 'manage')
  @ApiOperation({ summary: 'Create a new status column' })
  async createStatus(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @OrgId() organizationId: string,
    @Body() dto: CreateStatusDto,
  ) {
    return this.boardsService.createStatus(projectId, organizationId, dto);
  }

  @Patch('statuses/:statusId')
  @RequirePermission('board', 'manage')
  @ApiOperation({ summary: 'Update a status column' })
  async updateStatus(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @Param('statusId', ParseUUIDPipe) statusId: string,
    @OrgId() organizationId: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.boardsService.updateStatus(projectId, statusId, organizationId, dto);
  }

  @Delete('statuses/:statusId')
  @RequirePermission('board', 'manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a status column (issues moved to first column)' })
  async deleteStatus(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @Param('statusId', ParseUUIDPipe) statusId: string,
    @OrgId() organizationId: string,
  ) {
    await this.boardsService.deleteStatus(projectId, statusId, organizationId);
  }

  @Patch('issues/reorder')
  @RequirePermission('issue', 'update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reorder issues on the board (drag & drop)' })
  async reorderIssues(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @OrgId() organizationId: string,
    @Body() dto: ReorderIssuesDto,
  ) {
    await this.boardsService.reorderIssues(projectId, organizationId, dto);
  }
}
