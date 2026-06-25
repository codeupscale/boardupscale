import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class UploadFileDto {
  @ApiPropertyOptional({ example: 'uuid-of-issue' })
  @IsOptional()
  @IsUUID()
  issueId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-comment' })
  @IsOptional()
  @IsUUID()
  commentId?: string;

  @ApiPropertyOptional({ example: 'uuid-or-key-of-project' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  projectId?: string;
}
