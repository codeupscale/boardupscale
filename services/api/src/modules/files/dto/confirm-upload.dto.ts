import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

export class ConfirmUploadDto {
  @ApiProperty({ description: 'storageKey from POST /files/presign-upload' })
  @IsString()
  @IsNotEmpty()
  storageKey: string;

  @ApiProperty({ description: 'storageBucket from POST /files/presign-upload' })
  @IsString()
  @IsNotEmpty()
  storageBucket: string;

  @ApiProperty({ example: 'design.png' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ example: 'image/png' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[\w.+-]+\/[\w.+-]+$/, { message: 'Invalid MIME type' })
  mimeType: string;

  @ApiPropertyOptional({ example: 'uuid-of-issue' })
  @IsOptional()
  @IsUUID()
  issueId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-comment' })
  @IsOptional()
  @IsUUID()
  commentId?: string;

  @ApiPropertyOptional({
    description: 'Client-reported size (verified against S3 HEAD)',
    example: 1048576,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  fileSize?: number;
}
