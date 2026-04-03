import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MigrationOptionsDto {
  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  importAttachments?: boolean = false;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  importComments?: boolean = true;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  inviteMembers?: boolean = true;
}

export class StartMigrationDto {
  @ApiProperty({ description: 'Migration run ID returned by POST /connect' })
  @IsUUID()
  runId: string;

  @ApiProperty({ description: 'Jira project keys to migrate', example: ['PROJ', 'BACK'] })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  projectKeys: string[];

  @ApiPropertyOptional({
    description: 'Jira accountIds to import as members. Empty array = import all members.',
    example: ['abc123', 'def456'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  selectedMemberIds?: string[];

  @ApiPropertyOptional({ description: 'Jira status name → Boardupscale status name mapping' })
  @IsObject()
  @IsOptional()
  statusMapping?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Jira role name → Boardupscale role name mapping' })
  @IsObject()
  @IsOptional()
  roleMapping?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  options?: MigrationOptionsDto;
}

export class PreviewMigrationDto {
  @ApiProperty({ description: 'Migration run ID' })
  @IsUUID()
  runId: string;

  @ApiProperty({ description: 'Jira project keys to preview', example: ['PROJ'] })
  @IsArray()
  @IsString({ each: true })
  projectKeys: string[];
}
