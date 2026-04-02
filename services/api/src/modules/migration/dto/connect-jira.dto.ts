import { IsEmail, IsIn, IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConnectJiraDto {
  @ApiProperty({ example: 'https://acme.atlassian.net', description: 'Jira base URL' })
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(500)
  url: string;

  @ApiProperty({ example: 'user@example.com', description: 'Jira account email' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ description: 'Jira API token (never stored in plaintext)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  apiToken: string;

  @ApiPropertyOptional({ enum: ['cloud', 'server'], default: 'cloud' })
  @IsIn(['cloud', 'server'])
  type: 'cloud' | 'server' = 'cloud';
}
