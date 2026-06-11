import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsUUID, IsNumber, ValidateNested, IsOptional, ValidateIf } from 'class-validator';

export class IssueReorderItem {
  @ApiProperty({ example: 'uuid-of-issue' })
  @IsUUID()
  issueId: string;

  @ApiProperty({ example: 'uuid-of-status' })
  @IsUUID()
  statusId: string;

  @ApiProperty({ example: 1.5 })
  @IsNumber()
  position: number;

  /** When set (including null for backlog), updates sprint assignment in the same batch. */
  @ApiPropertyOptional({ example: 'uuid-of-sprint', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  sprintId?: string | null;
}

export class ReorderIssuesDto {
  @ApiProperty({ type: [IssueReorderItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IssueReorderItem)
  items: IssueReorderItem[];
}
