import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'uuid-of-issue' })
  @IsUUID()
  issueId: string;

  @ApiProperty({ example: 'This is a comment about the issue.' })
  @IsString()
  @MinLength(1)
  content: string;
}
