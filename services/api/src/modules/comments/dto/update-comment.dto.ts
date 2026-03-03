import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateCommentDto {
  @ApiProperty({ example: 'Updated comment content.' })
  @IsString()
  @MinLength(1)
  content: string;
}
