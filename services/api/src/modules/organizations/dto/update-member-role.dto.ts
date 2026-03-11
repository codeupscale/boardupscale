import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';

export class UpdateMemberRoleDto {
  @ApiProperty({ example: 'admin', enum: ['owner', 'admin', 'member'] })
  @IsString()
  @IsIn(['owner', 'admin', 'member'])
  role: string;
}
