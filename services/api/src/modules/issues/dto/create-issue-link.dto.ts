import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsString, IsIn } from 'class-validator';

export class CreateIssueLinkDto {
  @ApiProperty({ example: 'uuid-of-target-issue' })
  @IsUUID()
  targetIssueId: string;

  @ApiProperty({
    example: 'blocks',
    enum: ['blocks', 'duplicates', 'relates_to'],
  })
  @IsString()
  @IsIn(['blocks', 'duplicates', 'relates_to'])
  linkType: string;
}
