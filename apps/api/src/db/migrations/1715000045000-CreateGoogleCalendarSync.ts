import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Read model for the new Google Calendar engine (plan section 2.2). Only
 * CREATE TABLE (+ indexes/constraints): no existing table is altered and
 * nothing is backfilled, so the legacy `integration_account` pull keeps
 * running untouched and an old image boots on this schema.
 *
 *  - google_calendar_connection   one per owner; OAuth tokens stay in
 *                                 `integration_account` (linked, not copied).
 *  - google_calendar_subscription one per owner + Google calendar. Carries the
 *                                 sync token, the fencing `epoch`, the lease
 *                                 and the generation bookkeeping.
 *  - google_calendar_channel      push-notification channels (hashed token).
 *  - google_calendar_event        the minimised read copy (title only, no
 *                                 description / attendees / location).
 *  - google_calendar_publication  item -> Google event idempotency map for the
 *                                 optional write path, plus the durable
 *                                 delete-retry columns (`delete_pending_at`,
 *                                 `delete_attempts`).
 *
 * `down()` only drops the five tables (children first) and never calls Google;
 * channels are stopped by application code before a disconnect, not here.
 */
export class CreateGoogleCalendarSync1715000045000 implements MigrationInterface {
  name = 'CreateGoogleCalendarSync1715000045000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE google_calendar_connection (
        id                     BIGSERIAL PRIMARY KEY,
        owner_id               BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        integration_account_id BIGINT REFERENCES integration_account(id) ON DELETE SET NULL,
        status                 VARCHAR(24) NOT NULL DEFAULT 'active',
        granted_scopes         JSONB NOT NULL DEFAULT '[]',
        last_error             VARCHAR(255),
        -- Optional write-back to Google (plan section 2.2). Off until the user opts in.
        write_enabled          BOOLEAN NOT NULL DEFAULT false,
        -- Disconnect revoke-retry bookkeeping: set when Google could not be reached
        -- while revoking; a small worker retries (plan section 2.2).
        revoke_pending_at      TIMESTAMPTZ,
        revoke_attempts        INTEGER NOT NULL DEFAULT 0,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_gcal_connection_owner UNIQUE (owner_id),
        CONSTRAINT chk_gcal_connection_status CHECK (status IN ('active', 'needs_reconnect', 'disconnected'))
      )
    `);
    await qr.query(
      `CREATE INDEX idx_gcal_connection_revoke_pending ON google_calendar_connection(revoke_pending_at) WHERE revoke_pending_at IS NOT NULL`,
    );

    await qr.query(`
      CREATE TABLE google_calendar_subscription (
        id                  BIGSERIAL PRIMARY KEY,
        owner_id            BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        connection_id       BIGINT NOT NULL REFERENCES google_calendar_connection(id) ON DELETE CASCADE,
        google_calendar_id  VARCHAR(255) NOT NULL,
        summary             VARCHAR(255),
        -- True for the app-created calendar Husrevity publishes into (never read back).
        managed             BOOLEAN NOT NULL DEFAULT false,
        selected            BOOLEAN NOT NULL DEFAULT false,
        sync_token          TEXT,
        -- Fencing counter. Bumped on every lease acquire and on deselect; every
        -- write transaction re-checks it (see GoogleCalendarReadSyncService).
        epoch               INTEGER NOT NULL DEFAULT 0,
        lease_holder        VARCHAR(64),
        lease_expires_at    TIMESTAMPTZ,
        needs_sync_at       TIMESTAMPTZ,
        -- Rows of google_calendar_event are visible only when their generation
        -- equals active_generation. building_generation is the staging one.
        active_generation   INTEGER NOT NULL DEFAULT 0,
        building_generation INTEGER,
        window_min          TIMESTAMPTZ,
        window_max          TIMESTAMPTZ,
        last_sync_at        TIMESTAMPTZ,
        last_full_sync_at   TIMESTAMPTZ,
        last_error          VARCHAR(255),
        -- Per-subscription retry backoff: failed syncs grow the delay exponentially (capped),
        -- a success clears both. The worker skips rows whose next_attempt_at is in the future.
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        next_attempt_at     TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_gcal_subscription_owner_calendar UNIQUE (owner_id, google_calendar_id)
      )
    `);
    // At most one managed (app-created, publish-only) calendar per owner.
    await qr.query(
      `CREATE UNIQUE INDEX uq_gcal_subscription_one_managed ON google_calendar_subscription(owner_id) WHERE managed`,
    );
    await qr.query(`CREATE INDEX idx_gcal_subscription_connection ON google_calendar_subscription(connection_id)`);
    await qr.query(
      `CREATE INDEX idx_gcal_subscription_due ON google_calendar_subscription(needs_sync_at) WHERE selected`,
    );

    await qr.query(`
      CREATE TABLE google_calendar_channel (
        id               UUID PRIMARY KEY,
        owner_id         BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        subscription_id  BIGINT NOT NULL REFERENCES google_calendar_subscription(id) ON DELETE CASCADE,
        token_hash       VARCHAR(64) NOT NULL,
        resource_id      VARCHAR(255),
        expires_at       TIMESTAMPTZ NOT NULL,
        stopped_at       TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX idx_gcal_channel_subscription ON google_calendar_channel(subscription_id)`);
    await qr.query(`CREATE INDEX idx_gcal_channel_expires_at ON google_calendar_channel(expires_at)`);

    await qr.query(`
      CREATE TABLE google_calendar_event (
        id                  BIGSERIAL PRIMARY KEY,
        owner_id            BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        subscription_id     BIGINT NOT NULL REFERENCES google_calendar_subscription(id) ON DELETE CASCADE,
        generation          INTEGER NOT NULL,
        google_event_id     VARCHAR(1024) NOT NULL,
        recurring_event_id  VARCHAR(1024),
        original_start_at   TIMESTAMPTZ,
        original_start_date DATE,
        status              VARCHAR(16) NOT NULL DEFAULT 'confirmed',
        title               VARCHAR(255) NOT NULL DEFAULT '',
        all_day             BOOLEAN NOT NULL,
        -- Timed events: instants. All-day events: calendar dates, never an instant
        -- (no timezone shift, no UTC-midnight conversion). The CHECK below keeps
        -- the two shapes mutually exclusive.
        start_at            TIMESTAMPTZ,
        end_at              TIMESTAMPTZ,
        start_date          DATE,
        end_date_exclusive  DATE,
        html_link           TEXT,
        etag                VARCHAR(255),
        google_updated_at   TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_gcal_event_sub_gen_event UNIQUE (subscription_id, generation, google_event_id),
        CONSTRAINT chk_gcal_event_status CHECK (status IN ('confirmed', 'tentative')),
        CONSTRAINT chk_gcal_event_shape CHECK (
          (all_day AND start_date IS NOT NULL AND end_date_exclusive IS NOT NULL
                   AND start_at IS NULL AND end_at IS NULL)
          OR
          (NOT all_day AND start_at IS NOT NULL AND end_at IS NOT NULL
                       AND start_date IS NULL AND end_date_exclusive IS NULL)
        )
      )
    `);
    await qr.query(
      `CREATE INDEX idx_gcal_event_owner_range ON google_calendar_event(owner_id, subscription_id, generation, start_at)`,
    );
    await qr.query(
      `CREATE INDEX idx_gcal_event_owner_dates ON google_calendar_event(owner_id, subscription_id, generation, start_date)`,
    );
    await qr.query(
      `CREATE INDEX idx_gcal_event_series ON google_calendar_event(subscription_id, generation, recurring_event_id) WHERE recurring_event_id IS NOT NULL`,
    );

    await qr.query(`
      CREATE TABLE google_calendar_publication (
        id               BIGSERIAL PRIMARY KEY,
        owner_id         BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        item_id          BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        subscription_id  BIGINT NOT NULL REFERENCES google_calendar_subscription(id) ON DELETE CASCADE,
        google_event_id  VARCHAR(1024) NOT NULL,
        etag             VARCHAR(255),
        -- Durable delete retry: set when the published copy must disappear from
        -- Google (item deleted / no longer eligible / write turned off). A worker
        -- removes the Google event and then the row, with bounded attempts.
        delete_pending_at TIMESTAMPTZ,
        delete_attempts   INTEGER NOT NULL DEFAULT 0,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_gcal_publication_item_sub UNIQUE (item_id, subscription_id),
        CONSTRAINT uq_gcal_publication_sub_event UNIQUE (subscription_id, google_event_id)
      )
    `);
    await qr.query(
      `CREATE INDEX idx_gcal_publication_delete_pending ON google_calendar_publication(delete_pending_at) WHERE delete_pending_at IS NOT NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS google_calendar_publication`);
    await qr.query(`DROP TABLE IF EXISTS google_calendar_event`);
    await qr.query(`DROP TABLE IF EXISTS google_calendar_channel`);
    await qr.query(`DROP TABLE IF EXISTS google_calendar_subscription`);
    await qr.query(`DROP TABLE IF EXISTS google_calendar_connection`);
  }
}
