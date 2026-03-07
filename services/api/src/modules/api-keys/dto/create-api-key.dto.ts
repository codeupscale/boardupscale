import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, MaxLength, MinLength, IsDateString } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'CI/CD Pipeline Key', description: 'Human-readable name for the API key' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    example: ['issues:read', 'issues:write'],
    description: 'Permission scopes for this key. Empty array means full access.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional({
    example: '2027-01-01T00:00:00Z',
    description: 'Expiration date for the key. Null means no expiration.',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
