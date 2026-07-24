import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ProjectHealthStatus } from '../project-health.constants';

export const PROJECT_HEALTH_PAGE_DEFAULT = 25;
export const PROJECT_HEALTH_PAGE_MAX = 50;

export class OrgProjectHealthQueryDto {
  @ApiPropertyOptional({
    enum: ['all', 'active', 'at_risk', 'blocked', 'completed'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['all', 'active', 'at_risk', 'blocked', 'completed'])
  status?: ProjectHealthStatus | 'all' = 'all';

  @ApiPropertyOptional({
    description: 'Opaque keyset cursor from previous page',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    default: PROJECT_HEALTH_PAGE_DEFAULT,
    minimum: 1,
    maximum: PROJECT_HEALTH_PAGE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PROJECT_HEALTH_PAGE_MAX)
  limit?: number = PROJECT_HEALTH_PAGE_DEFAULT;
}
