import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength, IsOptional } from 'class-validator';

export class ContactSupportDto {
  @ApiProperty({ example: 'Unable to create issues in my project' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  subject: string;

  @ApiProperty({ example: 'When I click "Create Issue" nothing happens...' })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message: string;

  @ApiPropertyOptional({ example: 'bug' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
}
