import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsUUID, IsNumber, ValidateNested } from 'class-validator';

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
}

export class ReorderIssuesDto {
  @ApiProperty({ type: [IssueReorderItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IssueReorderItem)
  items: IssueReorderItem[];
}
