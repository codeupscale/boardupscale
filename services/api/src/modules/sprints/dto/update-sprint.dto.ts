import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, MaxLength } from 'class-validator';

export class UpdateSprintDto {
  @ApiPropertyOptional({ example: 'Sprint 2' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'Complete backend API' })
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional({ example: '2024-01-15' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2024-01-28' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
