import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, MaxLength, IsIn } from 'class-validator';
import { SprintHandoffPolicy } from '../../../common/constants/sprint-handoff-policy';

export class CreateStatusDto {
  @ApiProperty({ example: 'In Review' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'in_progress', enum: ['todo', 'in_progress', 'done'] })
  @IsOptional()
  @IsString()
  category?: string = 'todo';

  @ApiPropertyOptional({ example: '#3B82F6' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ example: 5, description: 'WIP limit for this column (0 = no limit)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  wipLimit?: number;

  @ApiPropertyOptional({
    example: SprintHandoffPolicy.BLOCKS,
    enum: SprintHandoffPolicy,
    description: 'Whether non-done issues in this column block overdue sprint handoff',
  })
  @IsOptional()
  @IsIn(Object.values(SprintHandoffPolicy))
  sprintHandoffPolicy?: SprintHandoffPolicy;
}
