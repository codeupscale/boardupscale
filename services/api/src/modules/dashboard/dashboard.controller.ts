import {
  Controller,
  Get,
  Header,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { DashboardService } from './dashboard.service';
import { OrgDashboardQueryDto } from './dto/org-dashboard-query.dto';
import { OrgProjectHealthQueryDto } from './dto/org-project-health-query.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('organization')
  @Roles('owner')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Organization Owner dashboard (KPIs, member snapshot, status counts, activity)',
  })
  async getOrganizationDashboard(
    @OrgId() organizationId: string,
    @Query() query: OrgDashboardQueryDto,
  ) {
    const range = query.range ?? '7d';
    const data = await this.dashboardService.getOrgOwnerDashboard(
      organizationId,
      range,
    );
    return { data };
  }

  @Get('organization/project-health')
  @Roles('owner')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Keyset-paged project health rows for org dashboard infinite scroll',
  })
  async getOrganizationProjectHealth(
    @OrgId() organizationId: string,
    @Query() query: OrgProjectHealthQueryDto,
  ) {
    const data = await this.dashboardService.getOrgProjectHealth(
      organizationId,
      {
        status: query.status ?? 'all',
        cursor: query.cursor,
        limit: query.limit,
      },
    );
    return { data };
  }
}
