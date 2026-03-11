import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StartImportDto {
  @ApiProperty({ description: 'Temporary file path of uploaded JSON' })
  @IsString()
  filePath: string;

  @ApiProperty({ required: false, description: 'Target project ID (if importing into existing project)' })
  @IsUUID()
  @IsOptional()
  targetProjectId?: string;

  @ApiProperty({ required: false, description: 'User mapping overrides: { jiraEmail: boardupscaleUserId }' })
  @IsOptional()
  userMapping?: Record<string, string>;
}

export class PreviewImportDto {
  @ApiProperty({ description: 'Temporary file path of uploaded JSON' })
  @IsString()
  filePath: string;
}
