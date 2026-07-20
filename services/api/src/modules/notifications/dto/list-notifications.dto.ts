import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { IsInt, Min, Max } from 'class-validator';

export class ListNotificationsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: ['all', 'unread', 'mentions', 'assigned'],
    description: 'Filter tab for inbox panel',
  })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'unread', 'mentions', 'assigned'])
  filter?: 'all' | 'unread' | 'mentions' | 'assigned' = 'all';
}
