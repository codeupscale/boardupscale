import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsDateString, Min } from 'class-validator';

export class CreateWorkLogDto {
  @ApiProperty({ example: 3600, description: 'Time spent in seconds' })
  @IsInt()
  @Min(1)
  timeSpent: number;

  @ApiPropertyOptional({ example: 'Fixed the authentication bug' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '2024-01-15T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  loggedAt?: string;
}
