import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'abc123resettoken' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewSecure@Pass1', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
