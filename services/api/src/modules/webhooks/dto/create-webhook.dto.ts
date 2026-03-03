import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  IsUrl,
  IsObject,
  MaxLength,
  MinLength,
  ArrayMinSize,
  IsIn,
} from 'class-validator';
import { ALL_WEBHOOK_EVENTS } from '../webhook-events.constants';

export class CreateWebhookDto {
  @ApiProperty({ example: 'My Webhook' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'https://example.com/webhook' })
  @IsUrl({ require_tld: false })
  url: string;

  @ApiPropertyOptional({ example: 'my-secret-key' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  secret?: string;

  @ApiProperty({
    example: ['issue.created', 'issue.updated'],
    description: 'Array of event types to subscribe to',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsIn(ALL_WEBHOOK_EVENTS, { each: true })
  events: string[];

  @ApiPropertyOptional({ example: 'uuid-of-project' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ example: { 'X-Custom-Header': 'value' } })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
}
