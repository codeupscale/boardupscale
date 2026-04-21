import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsBoolean, IsOptional } from 'class-validator';

export class UpdateMemberEmailDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email: string;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Set true to confirm merging with an existing user' })
  confirmMerge?: boolean;
}
