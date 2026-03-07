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
import { BoardsService } from './boards.service';
import { CreateStatusDto } from './dto/create-status.dto';
import { ReorderIssuesDto } from './dto/reorder-issues.dto';
import { BoardQueryDto } from './dto/board-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('boards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @OrgId() organizationId: string,
    @Query() query: BoardQueryDto,
  ) {
    const board = await this.boardsService.getBoardData(projectId, organizationId, query);
    return { data: { statuses: board } };
  }

  @Post('statuses')
  @ApiOperation({ summary: 'Create a new status column' })
  async createStatus(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @OrgId() organizationId: string,
    @Body() dto: CreateStatusDto,
  ) {
    return this.boardsService.createStatus(projectId, organizationId, dto);
  }

  @Patch('statuses/:statusId')
  @ApiOperation({ summary: 'Update a status column' })
  async updateStatus(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('statusId', ParseUUIDPipe) statusId: string,
    @OrgId() organizationId: string,
    @Body() dto: CreateStatusDto,
  ) {
    return this.boardsService.updateStatus(projectId, statusId, organizationId, dto);
  }

  @Delete('statuses/:statusId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a status column (issues moved to first column)' })
  async deleteStatus(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('statusId', ParseUUIDPipe) statusId: string,
    @OrgId() organizationId: string,
  ) {
    await this.boardsService.deleteStatus(projectId, statusId, organizationId);
  }

  @Patch('issues/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reorder issues on the board (drag & drop)' })
  async reorderIssues(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @OrgId() organizationId: string,
    @Body() dto: ReorderIssuesDto,
  ) {
    await this.boardsService.reorderIssues(projectId, organizationId, dto);
  }
}
