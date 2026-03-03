import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, MaxLength } from 'class-validator';

export class CreateNotificationDto {
  @ApiProperty({ example: 'uuid-of-user' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'issue:assigned' })
  @IsString()
  @MaxLength(100)
  type: string;

  @ApiProperty({ example: 'You have been assigned to PROJ-42' })
  @IsString()
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional({ example: 'Fix the login bug by Friday' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ example: { issueId: 'uuid', projectId: 'uuid' } })
  @IsOptional()
  data?: Record<string, any>;
}
