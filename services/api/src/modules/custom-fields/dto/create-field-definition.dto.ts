import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  MaxLength,
  MinLength,
  IsIn,
  IsArray,
  ValidateNested,
} from 'class-validator';

export class CreateFieldDefinitionDto {
  @ApiProperty({ example: 'Environment' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'environment' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fieldKey: string;

  @ApiProperty({ example: 'select', enum: ['text', 'number', 'date', 'select', 'multi_select', 'url', 'checkbox', 'user'] })
  @IsString()
  @IsIn(['text', 'number', 'date', 'select', 'multi_select', 'url', 'checkbox', 'user'])
  fieldType: string;

  @ApiPropertyOptional({ example: 'Deployment environment for this issue' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  defaultValue?: any;

  @ApiPropertyOptional({ example: [{ label: 'Production', value: 'production', color: '#ef4444' }] })
  @IsOptional()
  options?: any;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
