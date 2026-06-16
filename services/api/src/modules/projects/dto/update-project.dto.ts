import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, MinLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProjectDto {
  @ApiPropertyOptional({ example: 'Updated Project Name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'active', enum: ['active', 'archived'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: '#3B82F6' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 'https://example.com/icon.png' })
  @IsOptional()
  @IsString()
  iconUrl?: string;

  @ApiPropertyOptional({ example: 'MYPROJ', description: 'Uppercase alphanumeric project key (2–10 chars)' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  @Matches(/^[A-Z0-9]+$/, { message: 'Key must be uppercase alphanumeric' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  key?: string;

  /** Immutable after creation — rejected explicitly if sent. */
  @ApiPropertyOptional({ example: 'scrum', enum: ['scrum', 'kanban'], description: 'Immutable after creation' })
  @IsOptional()
  @IsString()
  type?: string;

  /** Immutable after creation — rejected explicitly if sent. */
  @ApiPropertyOptional({ example: 'scrum', description: 'Immutable after creation' })
  @IsOptional()
  @IsString()
  templateType?: string;
}
