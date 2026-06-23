import { PipeTransform, Injectable, BadRequestException, Optional } from '@nestjs/common';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ParseUUIDPipe implements PipeTransform<string | undefined, string | undefined> {
  constructor(@Optional() private readonly options?: { optional?: boolean }) {}

  transform(value: string | undefined): string | undefined {
    if (value === undefined || value === '') {
      if (this.options?.optional) return undefined;
      throw new BadRequestException('A valid UUID is required');
    }
    if (!UUID_REGEX.test(value)) {
      throw new BadRequestException(`"${value}" is not a valid UUID`);
    }
    return value;
  }
}
