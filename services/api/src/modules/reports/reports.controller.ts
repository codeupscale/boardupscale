import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('sprint-burndown')
  @ApiOperation({ summary: 'Get sprint burndown chart data' })
  @ApiQuery({ name: 'sprintId', required: true })
  async getSprintBurndown(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('sprintId', ParseUUIDPipe) sprintId: string,
    @OrgId() organizationId: string,
  ) {
    const data = await this.reportsService.getSprintBurndown(projectId, sprintId, organizationId);
    return { data };
  }

  @Get('velocity')
  @ApiOperation({ summary: 'Get velocity chart data for recent sprints' })
  @ApiQuery({ name: 'sprintCount', required: false })
  async getVelocity(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @OrgId() organizationId: string,
    @Query('sprintCount') sprintCount?: string,
  ) {
    const count = sprintCount ? parseInt(sprintCount, 10) : 6;
    const data = await this.reportsService.getVelocity(projectId, organizationId, count);
    return { data };
  }

  @Get('cumulative-flow')
  @ApiOperation({ summary: 'Get cumulative flow diagram data' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getCumulativeFlow(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @OrgId() organizationId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const data = await this.reportsService.getCumulativeFlow(projectId, organizationId, startDate, endDate);
    return { data };
  }

  @Get('issue-breakdown')
  @ApiOperation({ summary: 'Get issue breakdown by type, priority, and status' })
  async getIssueBreakdown(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @OrgId() organizationId: string,
  ) {
    const data = await this.reportsService.getIssueBreakdown(projectId, organizationId);
    return { data };
  }

  @Get('assignee-workload')
  @ApiOperation({ summary: 'Get assignee workload distribution' })
  async getAssigneeWorkload(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @OrgId() organizationId: string,
  ) {
    const data = await this.reportsService.getAssigneeWorkload(projectId, organizationId);
    return { data };
  }

  @Get('cycle-time')
  @ApiOperation({ summary: 'Get cycle time analytics' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getCycleTime(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @OrgId() organizationId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const data = await this.reportsService.getCycleTime(projectId, organizationId, startDate, endDate);
    return { data };
  }

  @Get('sprint-report')
  @ApiOperation({ summary: 'Get comprehensive sprint report' })
  @ApiQuery({ name: 'sprintId', required: true })
  async getSprintReport(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('sprintId', ParseUUIDPipe) sprintId: string,
    @OrgId() organizationId: string,
  ) {
    const data = await this.reportsService.getSprintReport(projectId, sprintId, organizationId);
    return { data };
  }
}
