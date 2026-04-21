import 'reflect-metadata';
import '../load-env';
import { DataSource } from 'typeorm';
import { join } from 'path';

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
