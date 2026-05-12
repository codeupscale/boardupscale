import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class AddMemberDto {
  @ApiProperty({ example: 'uuid-of-user' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ example: 'member', enum: ['admin', 'member', 'viewer'] })
  @IsOptional()
  @IsString()
  role?: string = 'member';
}
