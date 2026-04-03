import * as dotenv from 'dotenv';
import { join } from 'path';
import { existsSync } from 'fs';

// Nest compiles to `dist/src/`; `cwd` is usually `services/api` when using npm scripts.
const candidates = [
  join(process.cwd(), '.env'),
  join(process.cwd(), '../../.env'),
  join(__dirname, '../../../.env'),
  join(__dirname, '../../../../.env'),
];

for (const p of candidates) {
  if (existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}
