import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'de', 'ja'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export class UpdateLanguageDto {
  @ApiProperty({
    example: 'en',
    description: 'User preferred language',
    enum: SUPPORTED_LOCALES,
  })
  @IsString()
  @IsIn(SUPPORTED_LOCALES, {
    message: `Language must be one of: ${SUPPORTED_LOCALES.join(', ')}`,
  })
  language: SupportedLocale;
}
