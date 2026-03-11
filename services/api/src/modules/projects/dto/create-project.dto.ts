import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, MinLength, Matches, IsEnum } from 'class-validator';

export enum ProjectTemplate {
  SCRUM = 'scrum',
  KANBAN = 'kanban',
  BUG_TRACKING = 'bug-tracking',
  BLANK = 'blank',
}

export class CreateProjectDto {
  @ApiProperty({ example: 'My Project' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'MYPROJ', description: 'Uppercase alphanumeric, 2-10 chars' })
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  @Matches(/^[A-Z0-9]+$/, { message: 'Key must be uppercase alphanumeric' })
  key: string;

  @ApiPropertyOptional({ example: 'A project for managing tasks' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'scrum', enum: ['scrum', 'kanban'] })
  @IsOptional()
  @IsString()
  type?: string = 'scrum';

  @ApiPropertyOptional({
    enum: ProjectTemplate,
    example: ProjectTemplate.SCRUM,
    description: 'Project template to use. Determines initial statuses.',
  })
  @IsOptional()
  @IsEnum(ProjectTemplate)
  templateType?: ProjectTemplate;
}
