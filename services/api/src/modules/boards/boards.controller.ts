import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BoardsService } from './boards.service';
import { CreateStatusDto } from './dto/create-status.dto';
import { ReorderIssuesDto } from './dto/reorder-issues.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('boards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('boards')
export class BoardsController {
  constructor(private boardsService: BoardsService) {}

  @Get(':projectId')
  @ApiOperation({ summary: 'Get board data for a project' })
  async getBoard(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @OrgId() organizationId: string,
  ) {
    const board = await this.boardsService.getBoardData(projectId, organizationId);
    return { data: board };
  }

  @Post(':projectId/statuses')
  @ApiOperation({ summary: 'Create a new status column' })
  async createStatus(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @OrgId() organizationId: string,
    @Body() dto: CreateStatusDto,
  ) {
    return this.boardsService.createStatus(projectId, organizationId, dto);
  }

  @Patch(':projectId/statuses/:statusId')
  @ApiOperation({ summary: 'Update a status column' })
  async updateStatus(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('statusId', ParseUUIDPipe) statusId: string,
    @OrgId() organizationId: string,
    @Body() dto: CreateStatusDto,
  ) {
    return this.boardsService.updateStatus(projectId, statusId, organizationId, dto);
  }

  @Delete(':projectId/statuses/:statusId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a status column (issues moved to first column)' })
  async deleteStatus(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('statusId', ParseUUIDPipe) statusId: string,
    @OrgId() organizationId: string,
  ) {
    await this.boardsService.deleteStatus(projectId, statusId, organizationId);
  }

  @Patch(':projectId/issues/reorder')
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
