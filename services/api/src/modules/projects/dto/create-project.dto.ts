import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, MinLength, Matches } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'My Project' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'MYPROJ', description: 'Uppercase alphanumeric, 2-10 chars' })
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  @Matches(/^[A-Z0-9]+$/, { message: 'Key must be uppercase alphanumeric' })
  key: string;

  @ApiPropertyOptional({ example: 'A project for managing tasks' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'software', enum: ['software', 'business', 'marketing'] })
  @IsOptional()
  @IsString()
  type?: string = 'software';
}
