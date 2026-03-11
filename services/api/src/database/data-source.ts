import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

// In the monorepo, .env lives at the repo root (three levels up from this file:
// src/database/ → src/ → services/api/ → repo root).
// dotenv falls back gracefully if the file is not found (e.g. in CI where env
// vars are injected directly).
dotenv.config({ path: join(__dirname, '../../../../.env') });

/**
 * AppDataSource is used exclusively by the TypeORM CLI for generating,
 * running, and reverting migrations.  The NestJS application uses its own
 * TypeOrmModule.forRootAsync() configuration in app.module.ts.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/boardupscale',
  entities: [join(__dirname, '/../**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, '/migrations/*{.ts,.js}')],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
