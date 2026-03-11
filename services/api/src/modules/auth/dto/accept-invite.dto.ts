import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({ description: 'Invitation token from the email link' })
  @IsString()
  token: string;

  @ApiProperty({ description: 'New password for the account', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ description: 'Display name for the user', minLength: 1 })
  @IsString()
  @MinLength(1)
  displayName: string;
}
