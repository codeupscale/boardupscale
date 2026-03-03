import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  IsInt,
  Min,
  IsDateString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateIssueDto {
  @ApiProperty({ example: 'uuid-of-project' })
  @IsUUID()
  projectId: string;

  @ApiProperty({ example: 'Fix login bug' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional({ example: 'Detailed description of the issue' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'task', enum: ['epic', 'story', 'task', 'bug', 'subtask'] })
  @IsOptional()
  @IsString()
  type?: string = 'task';

  @ApiPropertyOptional({ example: 'medium', enum: ['critical', 'high', 'medium', 'low'] })
  @IsOptional()
  @IsString()
  priority?: string = 'medium';

  @ApiPropertyOptional({ example: 'uuid-of-status' })
  @IsOptional()
  @IsUUID()
  statusId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-assignee' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-parent-issue' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-sprint' })
  @IsOptional()
  @IsUUID()
  sprintId?: string;

  @ApiPropertyOptional({ example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  storyPoints?: number;

  @ApiPropertyOptional({ example: 3600, description: 'Time estimate in seconds' })
  @IsOptional()
  @IsInt()
  @Min(0)
  timeEstimate?: number;

  @ApiPropertyOptional({ example: ['backend', 'auth'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];
}
