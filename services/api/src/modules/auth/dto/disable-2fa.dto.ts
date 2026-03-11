import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class Disable2FADto {
  @ApiProperty({ description: 'Current password for confirmation' })
  @IsString()
  password: string;
}
