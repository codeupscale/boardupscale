import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

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
}
