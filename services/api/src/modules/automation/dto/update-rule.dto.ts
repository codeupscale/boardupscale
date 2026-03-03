import { ApiPropertyOptional } from '@nestjs/swagger';
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

export class UpdateRuleDto {
  @ApiPropertyOptional({ example: 'Auto-assign P0 bugs' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TriggerType })
  @IsOptional()
  @IsEnum(TriggerType)
  triggerType?: TriggerType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  conditions?: any[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  actions?: any[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
