import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'Hello, team!' })
  @IsString()
  @MinLength(1)
  content: string;
}
