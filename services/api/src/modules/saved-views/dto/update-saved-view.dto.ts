import { PartialType } from '@nestjs/mapped-types';
import { CreateSavedViewDto } from './create-saved-view.dto';

export class UpdateSavedViewDto extends PartialType(CreateSavedViewDto) {}
