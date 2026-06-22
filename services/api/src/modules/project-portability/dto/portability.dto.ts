import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PROJECT_TYPE } from '../../projects/project-type';

export class UploadBundleResponseDto {
  @ApiProperty()
  filePath: string;

  @ApiProperty()
  exportId: string;

  @ApiProperty()
  sourceProjectKey: string;

  @ApiProperty()
  sourceType: string;

  @ApiProperty()
  issueCount: number;
}

export class PreviewPortabilityImportDto {
  @ApiProperty({ description: 'Path returned from upload endpoint' })
  @IsString()
  @IsNotEmpty()
  filePath: string;

  @ApiPropertyOptional({
    description: 'When set, import merges into this project (from project settings). Key/name/type are taken from the project.',
  })
  @IsOptional()
  @IsUUID()
  targetProjectId?: string;

  @ApiPropertyOptional({ enum: [PROJECT_TYPE.SCRUM, PROJECT_TYPE.KANBAN] })
  @ValidateIf((dto: PreviewPortabilityImportDto) => !dto.targetProjectId)
  @IsIn([PROJECT_TYPE.SCRUM, PROJECT_TYPE.KANBAN])
  targetType?: string;

  @ApiPropertyOptional({ example: 'MYPROJ' })
  @ValidateIf((dto: PreviewPortabilityImportDto) => !dto.targetProjectId)
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  @Matches(/^[A-Z][A-Z0-9]*$/, {
    message: 'Project key must be uppercase letters and numbers, starting with a letter',
  })
  targetProjectKey?: string;

  @ApiPropertyOptional({ example: 'My Imported Project' })
  @ValidateIf((dto: PreviewPortabilityImportDto) => !dto.targetProjectId)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  targetProjectName?: string;

  @ApiPropertyOptional({ description: 'Optional source status name → target status name overrides' })
  @IsOptional()
  @IsObject()
  statusMapping?: Record<string, string>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  importComments?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  importMembers?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  importCustomFields?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  importSprints?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  importComponents?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  importVersions?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  importAttachments?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  importIssueLinks?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  importWatchers?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  importWorkLogs?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  importProjectSettings?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  preserveIssueNumbers?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  preserveTimestamps?: boolean;
}

export class StartPortabilityImportDto extends PreviewPortabilityImportDto {
  @ApiPropertyOptional({ description: 'Must match preview if provided' })
  @IsOptional()
  @IsString()
  previewChecksum?: string;
}
