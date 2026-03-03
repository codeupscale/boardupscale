import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  MaxLength,
  MinLength,
  IsIn,
} from 'class-validator';

export class UpdateFieldDefinitionDto {
  @ApiPropertyOptional({ example: 'Environment' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'select' })
  @IsOptional()
  @IsString()
  @IsIn(['text', 'number', 'date', 'select', 'multi_select', 'url', 'checkbox', 'user'])
  fieldType?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  options?: any;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
