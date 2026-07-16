import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class LinkAttachmentsToIssueDto {
  @ApiProperty({ example: 'uuid-of-issue' })
  @IsUUID()
  issueId: string;

  @ApiProperty({ type: [String], example: ['uuid-of-attachment'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  attachmentIds: string[];
}
