import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MCP_TOKEN_MAX_DAYS } from '../../api-keys/api-keys.service';

export class CreateMcpTokenDto {
  @ApiProperty({ example: 'Claude Code on laptop' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example: 90,
    description: 'Days until the token expires (1–365).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MCP_TOKEN_MAX_DAYS)
  expiresInDays?: number;

  @ApiPropertyOptional({
    example: false,
    description: 'Allow the token to create and edit issues (within your project permissions).',
  })
  @IsOptional()
  @IsBoolean()
  allowWrite?: boolean;
}
