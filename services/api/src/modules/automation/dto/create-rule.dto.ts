import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsObject,
  IsEnum,
  MaxLength,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { TriggerType } from '../automation.types';

export class CreateRuleDto {
  @ApiProperty({ example: 'Auto-assign P0 bugs' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Automatically assigns P0 bugs to the on-call engineer' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: TriggerType, example: TriggerType.ISSUE_CREATED })
  @IsEnum(TriggerType)
  triggerType: TriggerType;

  @ApiPropertyOptional({ example: {} })
  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, any>;

  @ApiPropertyOptional({
    example: [{ field: 'type', operator: 'equals', value: 'bug' }],
  })
  @IsOptional()
  @IsArray()
  conditions?: any[];

  @ApiProperty({
    example: [{ type: 'set_field', config: { field: 'priority', value: 'critical' } }],
  })
  @IsArray()
  actions: any[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
