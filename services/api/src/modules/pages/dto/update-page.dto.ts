import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreatePageDto } from './create-page.dto';

export class UpdatePageDto extends PartialType(CreatePageDto) {}

export class MovePageDto {
  @ApiPropertyOptional({ description: 'New parent page ID (null = root)' })
  @IsOptional()
  @IsUUID()
  parentPageId?: string | null;

  @ApiPropertyOptional({ description: 'New position within parent' })
  @IsOptional()
  @IsNumber()
  position?: number;
}
