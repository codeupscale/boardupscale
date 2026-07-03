import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Worker npm scripts usually run from `services/worker`; production builds run from dist.
const candidates = [
  join(process.cwd(), '.env'),
  join(process.cwd(), '../../.env'),
  join(__dirname, '../../.env'),
  join(__dirname, '../../../.env'),
];

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

for (const path of candidates) {
  if (!existsSync(path)) continue;

  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = unquote(line.slice(separatorIndex + 1));
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  break;
}
