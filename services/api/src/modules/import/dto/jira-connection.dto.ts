import {
  IsString,
  IsUrl,
  IsEmail,
  IsUUID,
  IsArray,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveJiraConnectionDto {
  @ApiProperty({
    description: 'Jira instance base URL',
    example: 'https://mycompany.atlassian.net',
  })
  @IsString()
  @IsUrl({ require_tld: false }) // allow local/self-hosted instances
  @MaxLength(500)
  jiraUrl: string;

  @ApiProperty({
    description: 'Jira account email address',
    example: 'admin@mycompany.com',
  })
  @IsEmail()
  @MaxLength(255)
  jiraEmail: string;

  @ApiProperty({
    description: 'Jira API token (generated from id.atlassian.com/manage-profile/security/api-tokens)',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  apiToken: string;
}

export class TestJiraConnectionDto {
  @ApiProperty({ description: 'Jira instance base URL' })
  @IsString()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  jiraUrl: string;

  @ApiProperty({ description: 'Jira account email address' })
  @IsEmail()
  @MaxLength(255)
  jiraEmail: string;

  @ApiProperty({ description: 'Jira API token' })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  apiToken: string;
}

export class StartApiImportDto {
  @ApiProperty({ description: 'Jira connection ID (from GET /import/jira/connection)' })
  @IsUUID()
  connectionId: string;

  @ApiProperty({
    description: 'Jira project keys to import',
    example: ['PROJ', 'MYAPP'],
  })
  @IsArray()
  @IsString({ each: true })
  projectKeys: string[];

  @ApiProperty({
    required: false,
    description: 'Target Boardupscale project ID (import all selected Jira projects into one)',
  })
  @IsUUID()
  @IsOptional()
  targetProjectId?: string;

  @ApiProperty({
    required: false,
    description: 'User mapping overrides: { jiraEmail: boardupscaleUserId }',
  })
  @IsOptional()
  userMapping?: Record<string, string>;
}
