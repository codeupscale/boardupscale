import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';

export class UpdateMemberRoleDto {
  @ApiProperty({ example: 'user', enum: ['owner', 'administrator', 'user'] })
  @IsString()
  @IsIn(['owner', 'administrator', 'user'])
  role: string;
}
