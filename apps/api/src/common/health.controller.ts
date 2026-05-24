import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from './public.decorator';

const DB_PING_TIMEOUT_MS = 500;

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  async check(): Promise<{ status: 'UP'; db: 'UP' }> {
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('db ping timeout')), DB_PING_TIMEOUT_MS),
        ),
      ]);
    } catch {
      throw new ServiceUnavailableException({ status: 'DOWN', db: 'DOWN' });
    }
    return { status: 'UP', db: 'UP' };
  }
}
