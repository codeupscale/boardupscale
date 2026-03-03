import { IsString, IsOptional, IsArray, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ description: 'Role name', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Role description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Permission IDs to assign', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds: string[];
}
