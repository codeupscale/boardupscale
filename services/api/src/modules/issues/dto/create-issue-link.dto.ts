import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsString, IsIn } from 'class-validator';

export class CreateIssueLinkDto {
  @ApiProperty({ example: 'uuid-of-target-issue' })
  @IsUUID()
  targetIssueId: string;

  @ApiProperty({
    example: 'blocks',
    enum: ['blocks', 'is_blocked_by', 'duplicates', 'is_duplicated_by', 'relates_to'],
  })
  @IsString()
  @IsIn(['blocks', 'is_blocked_by', 'duplicates', 'is_duplicated_by', 'relates_to'])
  linkType: string;
}
