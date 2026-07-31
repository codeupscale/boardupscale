import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DashboardRange } from '../project-health.constants';

export class OrgDashboardQueryDto {
  @ApiPropertyOptional({
    enum: ['7d', '30d'],
    default: '7d',
    description: 'Activity series window',
  })
  @IsOptional()
  @IsIn(['7d', '30d'])
  range?: DashboardRange = '7d';
}

/**
 * Member dashboard query — adds independent, per-widget project filters on
 * top of the shared range param. Each field narrows one specific widget
 * down to one of the caller's own/enrolled projects; omitted means "all of
 * them" for that widget. Widgets filter independently of one another.
 * "Recent Project Activity" is not included here — it's keyset-paged
 * separately via MemberActivityQueryDto (GET /dashboard/member/activity).
 */
export class MemberDashboardQueryDto extends OrgDashboardQueryDto {
  @ApiPropertyOptional({
    description: 'Restrict "Open Issues by Status" to a single project',
  })
  @IsOptional()
  @IsUUID()
  issueStatusProjectId?: string;

  @ApiPropertyOptional({
    description: 'Restrict "Active Sprint Overview" to a single project',
  })
  @IsOptional()
  @IsUUID()
  activeSprintProjectId?: string;

  @ApiPropertyOptional({
    description: 'Restrict "Team Workload" to a single project',
  })
  @IsOptional()
  @IsUUID()
  teamWorkloadProjectId?: string;
}
