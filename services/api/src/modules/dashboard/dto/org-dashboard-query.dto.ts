import { IsIn, IsOptional } from 'class-validator';
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
