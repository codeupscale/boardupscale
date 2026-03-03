import { IsString, IsOptional, IsArray, IsUUID, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRoleDto {
  @ApiPropertyOptional({ description: 'Role name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Role description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Permission IDs to assign', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}
