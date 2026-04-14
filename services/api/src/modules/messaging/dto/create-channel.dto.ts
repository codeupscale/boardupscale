import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsUUID, MinLength, ArrayMinSize } from 'class-validator';

export class CreateChannelDto {
  @ApiProperty({ example: 'Design Team' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: ['uuid-1', 'uuid-2'], description: 'User IDs to add as members' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  memberIds: string[];
}
