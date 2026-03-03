import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsDateString, MaxLength } from 'class-validator';

export class CreateSprintDto {
  @ApiProperty({ example: 'uuid-of-project' })
  @IsUUID()
  projectId: string;

  @ApiProperty({ example: 'Sprint 1' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Complete the authentication module' })
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2024-01-14' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
