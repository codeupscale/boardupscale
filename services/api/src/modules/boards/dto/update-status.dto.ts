import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, MaxLength } from 'class-validator';

export class UpdateStatusDto {
  @ApiPropertyOptional({ example: 'In Review' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'in_progress', enum: ['todo', 'in_progress', 'done'] })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: '#3B82F6' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ example: 5, description: 'WIP limit for this column (0 = no limit)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  wipLimit?: number;
}
