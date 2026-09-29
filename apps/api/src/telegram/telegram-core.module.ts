import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramLink } from './telegram-link.entity';
import { TelegramConfig } from './telegram.config';
import { TelegramApiService } from './telegram-api.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramNotifier } from './telegram.notifier';

/**
 * Deliberately split from TelegramModule: this module has zero dependency
 * on ItemModule (and, transitively, ProjectModule/NotificationModule) —
 * only `TelegramConfig`/`TelegramApiService`/`TelegramLinkService`/
 * `TelegramNotifier` live here. `NotificationModule` imports THIS module
 * (not the full `TelegramModule`) specifically so it can use
 * `TelegramNotifier` as a delivery channel without creating a module
 * import cycle: `TelegramModule` needs `ItemModule` (for
 * `TelegramMessageHandlerService`'s quick-add item creation), `ItemModule`
 * already imports `NotificationModule` (directly, and via `ProjectModule`)
 * — so `NotificationModule -> TelegramModule` would close a real cycle.
 * Verified empirically: a `Test.createTestingModule` boot of that shape
 * threw Nest's "A circular dependency between modules" error even after
 * wrapping both edges in `forwardRef()` — the graph has multiple
 * convergent paths back to `NotificationModule`, not a single edge a
 * forwardRef band-aid can cleanly break. This split needs no forwardRef at
 * all.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TelegramLink])],
  providers: [TelegramConfig, TelegramApiService, TelegramLinkService, TelegramNotifier],
  exports: [TelegramConfig, TelegramApiService, TelegramLinkService, TelegramNotifier],
})
export class TelegramCoreModule {}
