import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class PresignUploadDto {
  @ApiProperty({ example: 'design.png' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ example: 'image/png' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[\w.+-]+\/[\w.+-]+$/, { message: 'Invalid MIME type' })
  mimeType: string;

  @ApiProperty({ example: 1048576, description: 'File size in bytes' })
  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  fileSize: number;

  @ApiPropertyOptional({
    example: 'uuid-of-issue',
    description: 'Issue this file will be attached to (edit / comment flows)',
  })
  @IsOptional()
  @IsUUID()
  issueId?: string;

  @ApiPropertyOptional({
    example: 'uuid-or-key-of-project',
    description:
      'Project context for permission check when issueId is not yet available (create-issue flow)',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  projectId?: string;
}

export class PresignUploadResponseDto {
  @ApiProperty({ description: 'Temporary PUT URL the client uploads to' })
  url: string;

  @ApiProperty({ description: 'Opaque storage key — pass back to /confirm-upload' })
  storageKey: string;

  @ApiProperty({ description: 'Bucket — pass back to /confirm-upload' })
  storageBucket: string;

  @ApiPropertyOptional({
    description: 'Required request headers for the PUT (e.g. Content-Type)',
    example: { 'Content-Type': 'image/png' },
  })
  headers?: Record<string, string>;

  @ApiProperty({ description: 'URL expiry in seconds' })
  expiresIn: number;
}
