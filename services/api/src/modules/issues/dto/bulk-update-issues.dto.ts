import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class BulkUpdateIssuesDto {
  @ApiProperty({ example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @IsUUID('4', { each: true })
  issueIds: string[];

  @ApiPropertyOptional({ example: 'uuid-of-assignee' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-status' })
  @IsOptional()
  @IsUUID()
  statusId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-sprint' })
  @IsOptional()
  @IsUUID()
  sprintId?: string;

  @ApiPropertyOptional({ example: 'task', enum: ['task', 'story', 'bug', 'epic'] })
  @IsOptional()
  @IsEnum(['task', 'story', 'bug', 'epic'])
  type?: string;

  @ApiPropertyOptional({ example: 'high', enum: ['critical', 'high', 'medium', 'low'] })
  @IsOptional()
  @IsEnum(['critical', 'high', 'medium', 'low'])
  priority?: string;

  @ApiPropertyOptional({ example: ['backend', 'auth'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  storyPoints?: number;
}
