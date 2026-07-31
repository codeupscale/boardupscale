import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export const MEMBER_ACTIVITY_PAGE_DEFAULT = 20;
export const MEMBER_ACTIVITY_PAGE_MAX = 50;

export class MemberActivityQueryDto {
  @ApiPropertyOptional({
    description: 'Restrict to a single project the caller owns or is a member of',
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Opaque keyset cursor from previous page',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    default: MEMBER_ACTIVITY_PAGE_DEFAULT,
    minimum: 1,
    maximum: MEMBER_ACTIVITY_PAGE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MEMBER_ACTIVITY_PAGE_MAX)
  limit?: number = MEMBER_ACTIVITY_PAGE_DEFAULT;
}
