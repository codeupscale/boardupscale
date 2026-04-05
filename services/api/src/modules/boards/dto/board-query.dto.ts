import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class BoardQueryDto {
  @ApiPropertyOptional({ description: 'Filter by assignee user ID' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Filter by issue type (epic, story, task, bug)' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Filter by priority (critical, high, medium, low)' })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({ description: 'Filter by label' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ description: 'Search text in issue title' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by sprint ID (UUID or "backlog" for unassigned)' })
  @IsOptional()
  @IsString()
  sprintId?: string;

  @ApiPropertyOptional({ description: 'Max issues per column (1–200, default 50)', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  columnLimit?: number = 50;
}
