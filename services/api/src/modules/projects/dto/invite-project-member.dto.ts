import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class InviteProjectMemberDto {
  @ApiProperty({ example: 'client@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'Jane Client' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({
    example: 'viewer',
    enum: ['admin', 'member', 'viewer'],
    default: 'viewer',
    description: 'Project-level role to assign once the invite is accepted.',
  })
  @IsOptional()
  @IsString()
  projectRole?: string = 'viewer';
}
