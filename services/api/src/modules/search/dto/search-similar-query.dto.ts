import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SEARCH_PER_CATEGORY_MAX, SEARCH_QUERY_MAX_LENGTH } from '@/modules/search/dto/global-search-query.dto';

export const SIMILAR_TEXT_MIN_LENGTH = 5;
export const SIMILAR_DEFAULT_LIMIT = 5;

export class SearchSimilarQueryDto {
  @ApiProperty({
    description: 'Issue title/description text to find duplicates for',
    minLength: SIMILAR_TEXT_MIN_LENGTH,
    maxLength: SEARCH_QUERY_MAX_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(SIMILAR_TEXT_MIN_LENGTH)
  @MaxLength(SEARCH_QUERY_MAX_LENGTH)
  text: string;

  @ApiPropertyOptional({ description: 'Issue ID to exclude (when editing an existing issue)' })
  @IsOptional()
  @IsUUID()
  excludeIssueId?: string;

  @ApiPropertyOptional({
    description: 'Max similar issues to return',
    default: SIMILAR_DEFAULT_LIMIT,
    minimum: 1,
    maximum: SEARCH_PER_CATEGORY_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEARCH_PER_CATEGORY_MAX)
  limit?: number = SIMILAR_DEFAULT_LIMIT;
}
