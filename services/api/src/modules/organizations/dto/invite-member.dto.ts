import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

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

  @ApiPropertyOptional({
    example: false,
    description:
      'Set to true to create a genuinely new user even when Jira placeholder users exist in the org. ' +
      'When false (default) and placeholders exist, the endpoint returns 409 JIRA_MERGE_REQUIRED.',
  })
  @IsOptional()
  @IsBoolean()
  forceCreate?: boolean;
}
