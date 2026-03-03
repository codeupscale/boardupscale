import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  IsInt,
  Min,
  IsDateString,
  MaxLength,
  IsNumber,
} from 'class-validator';

export class UpdateIssueDto {
  @ApiPropertyOptional({ example: 'Updated title' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'bug' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'high' })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({ example: 'uuid-of-status' })
  @IsOptional()
  @IsUUID()
  statusId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-assignee' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-sprint' })
  @IsOptional()
  @IsUUID()
  sprintId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-parent' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  storyPoints?: number;

  @ApiPropertyOptional({ example: 3600 })
  @IsOptional()
  @IsInt()
  @Min(0)
  timeEstimate?: number;

  @ApiPropertyOptional({ example: ['backend'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @ApiPropertyOptional({ example: 1.5 })
  @IsOptional()
  @IsNumber()
  position?: number;
}
