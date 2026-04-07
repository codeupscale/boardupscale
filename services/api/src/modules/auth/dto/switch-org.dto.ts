import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SwitchOrgDto {
  @ApiProperty({ description: 'Target organization ID to switch to' })
  @IsUUID()
  organizationId: string;
}
