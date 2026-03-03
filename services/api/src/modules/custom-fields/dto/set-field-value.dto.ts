import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsDefined } from 'class-validator';

export class SetFieldValueDto {
  @ApiProperty({ example: 'uuid-of-field-definition' })
  @IsUUID()
  fieldId: string;

  @ApiProperty({ example: 'production' })
  @IsDefined()
  value: any;
}
