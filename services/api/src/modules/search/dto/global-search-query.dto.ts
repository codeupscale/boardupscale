import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const SEARCH_QUERY_MAX_LENGTH = 200;
export const SEARCH_PER_CATEGORY_MAX = 25;
export const SEARCH_PER_CATEGORY_DEFAULT = 10;

export class GlobalSearchQueryDto {
  @ApiProperty({ description: 'Search query', minLength: 1, maxLength: SEARCH_QUERY_MAX_LENGTH })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(SEARCH_QUERY_MAX_LENGTH)
  q: string;

  @ApiPropertyOptional({ description: 'Filter by issue type (epic, story, task, bug, …)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @ApiPropertyOptional({ description: 'Filter by priority' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  priority?: string;

  @ApiPropertyOptional({ description: 'Filter by status name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  status?: string;

  @ApiPropertyOptional({
    description: 'Max results per category',
    default: SEARCH_PER_CATEGORY_DEFAULT,
    minimum: 1,
    maximum: SEARCH_PER_CATEGORY_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEARCH_PER_CATEGORY_MAX)
  limit?: number = SEARCH_PER_CATEGORY_DEFAULT;
}
