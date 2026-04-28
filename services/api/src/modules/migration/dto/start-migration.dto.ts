import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
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

  /**
   * When true, the worker runs a Phase 0 hard-delete of all existing Jira-sourced
   * data for the selected projects before importing. This gives a clean slate:
   * - Projects, issues, sprints, comments, attachments, statuses are hard-deleted
   * - Native (non-Jira) projects in the org are untouched
   * - After import, all comments get jira_comment_id so future re-runs are idempotent
   */
  @ApiPropertyOptional({ default: false, description: 'Hard-delete existing Jira data before importing (clean slate re-migration)' })
  @IsBoolean()
  @IsOptional()
  resetBeforeImport?: boolean = false;
}

export class ResetJiraDataDto {
  @ApiPropertyOptional({
    description: 'Specific Jira project keys to reset. Omit to reset ALL Jira-sourced projects in the org.',
    example: ['PROJ', 'BACK'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  projectKeys?: string[];
}

export class SelectedProjectDto {
  @ApiProperty({ example: 'PROJ' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ example: 'My Project' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 42 })
  @IsInt()
  @Min(0)
  @IsOptional()
  issueCount?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sprintCount?: number;
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
    description: 'Full project objects with key, name, and counts. When provided, used instead of projectKeys for storing project metadata.',
    type: [SelectedProjectDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedProjectDto)
  @IsOptional()
  selectedProjects?: SelectedProjectDto[];

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

  @ApiPropertyOptional({
    description:
      'When true, only run member import phases (1 + 1b). Skip projects, sprints, issues, comments, attachments.',
  })
  @IsBoolean()
  @IsOptional()
  membersOnly?: boolean;
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
