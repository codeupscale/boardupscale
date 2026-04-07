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
  ValidateIf,
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

  @ApiPropertyOptional({ example: 'uuid-of-assignee', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  assigneeId?: string | null;

  @ApiPropertyOptional({ example: 'uuid-of-sprint', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  sprintId?: string | null;

  @ApiPropertyOptional({ example: 'uuid-of-parent', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ example: '2024-12-31', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ example: 5, nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  storyPoints?: number | null;

  @ApiPropertyOptional({ example: 3600, nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  timeEstimate?: number | null;

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
