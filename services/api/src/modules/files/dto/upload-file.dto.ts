import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class UploadFileDto {
  @ApiPropertyOptional({ example: 'uuid-of-issue' })
  @IsOptional()
  @IsUUID()
  issueId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-comment' })
  @IsOptional()
  @IsUUID()
  commentId?: string;
}
