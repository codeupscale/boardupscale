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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import {
  MemberDashboardQueryDto,
  OrgDashboardQueryDto,
} from './dto/org-dashboard-query.dto';
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

  @Get('member')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Member dashboard (everyone except Owner) — KPIs, issue-status donut, active sprints, team workload, activity, scoped to own + enrolled projects; optionally narrowed to one project via projectId',
  })
  async getMemberDashboard(
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Query() query: MemberDashboardQueryDto,
  ) {
    const range = query.range ?? '7d';
    const data = await this.dashboardService.getMemberDashboard(
      organizationId,
      userId,
      range,
      {
        issueStatusProjectId: query.issueStatusProjectId,
        activeSprintProjectId: query.activeSprintProjectId,
        teamWorkloadProjectId: query.teamWorkloadProjectId,
        recentActivityProjectId: query.recentActivityProjectId,
      },
    );
    return { data };
  }

  @Get('member/projects')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Projects the caller owns or is a member of — populates the member dashboard project filter',
  })
  async getMemberScopedProjects(
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.dashboardService.getMemberScopedProjects(
      organizationId,
      userId,
    );
    return { data };
  }

  @Get('member/project-health')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Keyset-paged project health rows for member dashboard infinite scroll, scoped to own + enrolled projects',
  })
  async getMemberProjectHealth(
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Query() query: OrgProjectHealthQueryDto,
  ) {
    const data = await this.dashboardService.getMemberProjectHealth(
      organizationId,
      userId,
      {
        status: query.status ?? 'all',
        cursor: query.cursor,
        limit: query.limit,
      },
    );
    return { data };
  }
}
