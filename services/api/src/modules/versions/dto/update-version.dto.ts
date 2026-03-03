import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  IsDateString,
  IsIn,
} from 'class-validator';

export class UpdateVersionDto {
  @ApiPropertyOptional({ example: 'v1.0.0' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'First major release' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'unreleased', enum: ['unreleased', 'released', 'archived'] })
  @IsOptional()
  @IsString()
  @IsIn(['unreleased', 'released', 'archived'])
  status?: string;

  @ApiPropertyOptional({ example: '2025-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2025-03-01' })
  @IsOptional()
  @IsDateString()
  releaseDate?: string;
}
