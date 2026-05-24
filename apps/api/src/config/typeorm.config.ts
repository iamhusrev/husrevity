import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';
import { AuditSubscriber } from '../common/audit.subscriber';

export const typeOrmConfig = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.HUSREVITY_DB_HOST ?? 'localhost',
  port: Number(process.env.HUSREVITY_DB_PORT ?? 5432),
  username: process.env.HUSREVITY_DB_USER ?? 'postgres',
  password: process.env.HUSREVITY_DB_PASSWORD ?? 'postgres',
  database: process.env.HUSREVITY_DB_NAME ?? 'husrevity_nest',
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, '..', 'db', 'migrations', '*.{ts,js}')],
  migrationsRun: false,
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  subscribers: [AuditSubscriber],
});
