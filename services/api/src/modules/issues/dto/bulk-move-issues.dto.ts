import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class BulkMoveIssuesDto {
  @ApiProperty({ example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @IsUUID('4', { each: true })
  issueIds: string[];

  @ApiProperty({ example: 'uuid-of-target-project' })
  @IsUUID()
  targetProjectId: string;

  @ApiPropertyOptional({ example: 'uuid-of-target-status' })
  @IsOptional()
  @IsUUID()
  targetStatusId?: string;
}
