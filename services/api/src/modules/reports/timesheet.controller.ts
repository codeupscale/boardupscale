import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class TimesheetController {
  constructor(private reportsService: ReportsService) {}

  @Get('timesheet')
  @ApiOperation({ summary: 'Get timesheet for a user' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getTimesheet(
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const targetUserId = userId || user.id;
    const data = await this.reportsService.getTimesheet(
      targetUserId,
      organizationId,
      startDate,
      endDate,
    );
    return { data };
  }

  @Get('team-timesheet')
  @ApiOperation({ summary: 'Get team timesheet' })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getTeamTimesheet(
    @OrgId() organizationId: string,
    @Query('projectId', ResolveProjectPipe) projectId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // If no projectId provided, get all work logs for the org
    const data = await this.reportsService.getTeamTimesheet(
      projectId || '',
      organizationId,
      startDate,
      endDate,
    );
    return { data };
  }
}
