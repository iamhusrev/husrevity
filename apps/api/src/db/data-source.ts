import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { join } from 'path';

// Dev: cwd is apps/api/ when invoked via `bun run migration:run` (root script
// does `cd apps/api && ...`), so dotenv default `.env` resolves correctly.
// Prod: env comes from docker env_file and `.env` doesn't exist — skip dotenv
// to avoid noisy "ENOENT" logs and to make NODE_ENV the single source of truth.
if (process.env.NODE_ENV !== 'production') {
  loadEnv();
}

export const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.HUSREVITY_DB_HOST ?? 'localhost',
  port: Number(process.env.HUSREVITY_DB_PORT ?? 5432),
  username: process.env.HUSREVITY_DB_USER ?? 'postgres',
  password: process.env.HUSREVITY_DB_PASSWORD ?? 'postgres',
  database: process.env.HUSREVITY_DB_NAME ?? 'husrevity_nest',
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: ['error', 'warn'],
});
