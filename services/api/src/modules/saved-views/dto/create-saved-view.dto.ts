import { IsString, IsNotEmpty, IsBoolean, IsObject, IsOptional, MaxLength } from 'class-validator';

export class CreateSavedViewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsObject()
  filters: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  isShared?: boolean;
}
