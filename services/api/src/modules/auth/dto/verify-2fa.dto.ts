import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class Verify2FADto {
  @ApiProperty({ description: 'Temporary token from login response' })
  @IsString()
  tempToken: string;

  @ApiProperty({ description: '6-digit TOTP code or backup code' })
  @IsString()
  @MinLength(6)
  code: string;
}
