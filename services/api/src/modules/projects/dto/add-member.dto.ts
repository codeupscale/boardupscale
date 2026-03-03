import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class AddMemberDto {
  @ApiProperty({ example: 'uuid-of-user' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ example: 'developer', enum: ['owner', 'admin', 'developer', 'viewer'] })
  @IsOptional()
  @IsString()
  role?: string = 'developer';
}
