import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, MaxLength } from 'class-validator';

export class CreateStatusDto {
  @ApiProperty({ example: 'In Review' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'in_progress', enum: ['todo', 'in_progress', 'done'] })
  @IsOptional()
  @IsString()
  category?: string = 'todo';

  @ApiPropertyOptional({ example: '#3B82F6' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
