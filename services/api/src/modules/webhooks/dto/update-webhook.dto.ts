import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsUrl,
  IsObject,
  IsBoolean,
  MaxLength,
  MinLength,
  ArrayMinSize,
  IsIn,
} from 'class-validator';
import { ALL_WEBHOOK_EVENTS } from '../webhook-events.constants';

export class UpdateWebhookDto {
  @ApiPropertyOptional({ example: 'My Updated Webhook' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'https://example.com/webhook' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  @ApiPropertyOptional({ example: 'new-secret-key' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  secret?: string;

  @ApiPropertyOptional({
    example: ['issue.created', 'issue.updated'],
    description: 'Array of event types to subscribe to',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsIn(ALL_WEBHOOK_EVENTS, { each: true })
  events?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: { 'X-Custom-Header': 'value' } })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
}
