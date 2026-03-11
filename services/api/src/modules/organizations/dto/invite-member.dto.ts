import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsIn } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ example: 'member', default: 'member', enum: ['owner', 'admin', 'member'] })
  @IsOptional()
  @IsString()
  @IsIn(['owner', 'admin', 'member'])
  role?: string = 'member';
}
