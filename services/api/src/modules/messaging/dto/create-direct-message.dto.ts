import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateDirectMessageDto {
  @ApiProperty({ example: 'uuid-of-other-user' })
  @IsUUID()
  userId: string;
}
