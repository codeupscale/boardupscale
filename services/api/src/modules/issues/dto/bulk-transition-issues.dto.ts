import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class BulkTransitionIssuesDto {
  @ApiProperty({ example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @IsUUID('4', { each: true })
  issueIds: string[];

  @ApiProperty({ example: 'uuid-of-target-status' })
  @IsUUID()
  statusId: string;
}
