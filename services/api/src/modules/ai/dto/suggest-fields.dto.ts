import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SuggestFieldsDto {
  @ApiProperty({ description: 'Issue title text' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional({ description: 'Issue description text' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: 'Project ID for context' })
  @IsOptional()
  @IsString()
  projectId?: string;
}

export class SummarizeIssueDto {
  // No body needed — issueId comes from the URL param
}
