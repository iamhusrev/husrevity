import 'reflect-metadata';
jest.mock('pg-boss', () => ({ PgBoss: jest.fn() }));
process.env.HUSREVITY_JWT_SECRET = 'module-graph-test-secret-at-least-32-bytes-long!!';
import { Global, Module, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ItemModule } from './item/item.module';
import { NotificationModule } from './notification/notification.module';
import { ProjectModule } from './project/project.module';
import { TelegramModule } from './telegram/telegram.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { DeviceModule } from './device/device.module';
import { McpModule } from './mcp/mcp.module';
import { SlackCoreModule } from './slack/slack-core.module';
import { SlackModule } from './slack/slack.module';

/**
 * Guards the REAL module import graph. Per-service unit tests build isolated
 * `Test.createTestingModule` contexts with hand-provided mocks, so they can
 * never notice a circular module import or an unresolvable provider — such a
 * defect only shows up when the actual app boots (and `verify.sh` skips its
 * e2e boot when Postgres is unreachable). Twice this bit us (a provider-level
 * cycle in Google Calendar, a module-level cycle via Telegram).
 *
 * TypeORM is faked (no DB): forFeature() only needs a DataSource that can
 * hand out repositories. `compile()` instantiates providers but does not run
 * lifecycle hooks, so nothing connects to anything.
 */
const fakeDataSource = {
  options: { type: 'postgres' },
  entityMetadatas: [],
  getRepository: () => ({}),
  getMongoRepository: () => ({}),
  getTreeRepository: () => ({}),
};

@Global()
@Module({
  providers: [{ provide: DataSource, useValue: fakeDataSource }],
  exports: [DataSource],
})
class FakeTypeOrmModule {}

const roots: Array<[string, Type<unknown>]> = [
  ['NotificationModule', NotificationModule],
  ['ItemModule', ItemModule],
  ['ProjectModule', ProjectModule],
  ['TelegramModule', TelegramModule],
  ['IntegrationsModule', IntegrationsModule],
  ['DeviceModule', DeviceModule],
  ['McpModule', McpModule],
  ['SlackCoreModule', SlackCoreModule],
  ['SlackModule', SlackModule],
];

describe('real module graph', () => {
  it.each(roots)(
    '%s compiles from its own root (no circular imports / unresolved providers)',
    async (_name, mod) => {
      await expect(
        Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
            ScheduleModule.forRoot(),
            FakeTypeOrmModule,
            mod,
          ],
        }).compile(),
      ).resolves.toBeDefined();
    },
    60000,
  );
});
