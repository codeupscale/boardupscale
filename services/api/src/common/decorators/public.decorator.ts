import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Skip JWT / API-key auth (and org role checks) for this route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
