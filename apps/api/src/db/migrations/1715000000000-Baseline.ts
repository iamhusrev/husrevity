import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Consolidated baseline for husrevity_nest. Replaces the original 13-migration
 * history (Baseline → UserRolesAndInvites) with one fresh-DB-only schema.
 *
 * No admin seed — run `bun run seed:admin` after migration:run to bootstrap
 * the first admin user.
 */
export class Baseline1715000000000 implements MigrationInterface {
  name = 'Baseline1715000000000';

  public async up(qr: QueryRunner): Promise<void> {
    // ── Users ────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE app_user (
        id                          BIGSERIAL PRIMARY KEY,
        email                       VARCHAR(160) NOT NULL UNIQUE,
        password_hash               VARCHAR(255) NOT NULL,
        first_name                  VARCHAR(80),
        last_name                   VARCHAR(80),
        enabled                     BOOLEAN NOT NULL DEFAULT true,
        email_notifications_enabled BOOLEAN NOT NULL DEFAULT false,
        role                        VARCHAR(16) NOT NULL DEFAULT 'user',
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id               BIGINT,
        updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id               BIGINT,
        deleted_at                  TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_app_user_role ON app_user(role)`);

    await qr.query(`
      CREATE TABLE refresh_token (
        id          BIGSERIAL PRIMARY KEY,
        token_hash  VARCHAR(128) NOT NULL UNIQUE,
        user_id     BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        expires_at  TIMESTAMPTZ NOT NULL,
        revoked     BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await qr.query(`CREATE INDEX idx_refresh_token_user_id ON refresh_token(user_id)`);

    await qr.query(`
      CREATE TABLE user_invite (
        id                BIGSERIAL PRIMARY KEY,
        invited_by_id     BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        email             VARCHAR(160) NOT NULL,
        token_hash        VARCHAR(64) NOT NULL,
        role              VARCHAR(16) NOT NULL DEFAULT 'user',
        first_name        VARCHAR(80),
        last_name         VARCHAR(80),
        expires_at        TIMESTAMPTZ NOT NULL,
        accepted_at       TIMESTAMPTZ,
        accepted_user_id  BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id     BIGINT,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id     BIGINT,
        deleted_at        TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_user_invite_invited_by ON user_invite(invited_by_id)`);
    await qr.query(`CREATE INDEX idx_user_invite_email ON user_invite(LOWER(email))`);
    await qr.query(`CREATE UNIQUE INDEX uq_user_invite_token_hash ON user_invite(token_hash)`);

    // ── Notes ────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE note (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        title         VARCHAR(255) NOT NULL,
        body_markdown TEXT,
        pinned        BOOLEAN NOT NULL DEFAULT false,
        archived      BOOLEAN NOT NULL DEFAULT false,
        "position"    INTEGER NOT NULL DEFAULT 0,
        color_hex     VARCHAR(16),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_note_owner ON note(owner_id)`);
    await qr.query(`CREATE INDEX idx_note_owner_archived ON note(owner_id, archived)`);
    await qr.query(`CREATE INDEX idx_note_owner_position ON note(owner_id, "position")`);

    await qr.query(`
      CREATE TABLE note_tag (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        name          VARCHAR(64) NOT NULL,
        color         VARCHAR(16),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ,
        CONSTRAINT uq_note_tag_owner_name UNIQUE (owner_id, name)
      )
    `);
    await qr.query(`CREATE INDEX idx_note_tag_owner ON note_tag(owner_id)`);

    await qr.query(`
      CREATE TABLE note_tag_assignment (
        note_id BIGINT NOT NULL REFERENCES note(id) ON DELETE CASCADE,
        tag_id  BIGINT NOT NULL REFERENCES note_tag(id) ON DELETE CASCADE,
        PRIMARY KEY (note_id, tag_id)
      )
    `);
    await qr.query(`CREATE INDEX idx_note_tag_assignment_tag ON note_tag_assignment(tag_id)`);

    // ── Lists ────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE todo_list (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        name          VARCHAR(128) NOT NULL,
        color         VARCHAR(16),
        icon          VARCHAR(32),
        archived      BOOLEAN NOT NULL DEFAULT false,
        "position"    INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_todo_list_owner ON todo_list(owner_id)`);
    await qr.query(`CREATE INDEX idx_todo_list_owner_position ON todo_list(owner_id, "position")`);

    await qr.query(`
      CREATE TABLE list_item (
        id                    BIGSERIAL PRIMARY KEY,
        list_id               BIGINT NOT NULL REFERENCES todo_list(id) ON DELETE CASCADE,
        text                  VARCHAR(512) NOT NULL,
        done                  BOOLEAN NOT NULL DEFAULT false,
        due_at                TIMESTAMPTZ,
        "position"            INTEGER NOT NULL DEFAULT 0,
        notify_minutes_before INTEGER,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id         BIGINT,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id         BIGINT,
        deleted_at            TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_list_item_list ON list_item(list_id)`);
    await qr.query(`CREATE INDEX idx_list_item_list_position ON list_item(list_id, "position")`);

    // ── Projects & Tasks ─────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE project (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        code          VARCHAR(32) NOT NULL,
        name          VARCHAR(160) NOT NULL,
        description   TEXT,
        status        VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        start_date    DATE,
        end_date      DATE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ,
        CONSTRAINT uq_project_owner_code UNIQUE (owner_id, code)
      )
    `);
    await qr.query(`CREATE INDEX idx_project_owner ON project(owner_id)`);

    await qr.query(`
      CREATE TABLE task (
        id                    BIGSERIAL PRIMARY KEY,
        owner_id              BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        project_id            BIGINT REFERENCES project(id) ON DELETE SET NULL,
        title                 VARCHAR(255) NOT NULL,
        description           TEXT,
        status                VARCHAR(32) NOT NULL DEFAULT 'TODO',
        priority              VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
        due_at                TIMESTAMPTZ,
        "position"            INTEGER NOT NULL DEFAULT 0,
        notify_minutes_before INTEGER,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id         BIGINT,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id         BIGINT,
        deleted_at            TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_task_owner ON task(owner_id)`);
    await qr.query(`CREATE INDEX idx_task_project ON task(project_id)`);
    await qr.query(`CREATE INDEX idx_task_project_position ON task(project_id, "position")`);

    // ── Plans ────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE plan (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        title         VARCHAR(255) NOT NULL,
        description   TEXT,
        target_date   DATE,
        status        VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_plan_owner ON plan(owner_id)`);

    await qr.query(`
      CREATE TABLE plan_item (
        id            BIGSERIAL PRIMARY KEY,
        plan_id       BIGINT NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
        title         VARCHAR(255) NOT NULL,
        done          BOOLEAN NOT NULL DEFAULT false,
        target_date   DATE,
        order_index   INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_plan_item_plan ON plan_item(plan_id)`);
    await qr.query(`CREATE INDEX idx_plan_item_plan_order ON plan_item(plan_id, order_index)`);

    // ── Calendar ─────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE calendar_event (
        id               BIGSERIAL PRIMARY KEY,
        owner_id         BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        title            VARCHAR(255) NOT NULL,
        description      TEXT,
        start_at         TIMESTAMPTZ NOT NULL,
        end_at           TIMESTAMPTZ NOT NULL,
        all_day          BOOLEAN NOT NULL DEFAULT false,
        location         VARCHAR(255),
        color_hex        VARCHAR(16),
        reminder_minutes INTEGER,
        recurrence_rule  VARCHAR(512),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id    BIGINT,
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id    BIGINT,
        deleted_at       TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_calendar_event_owner ON calendar_event(owner_id)`);
    await qr.query(`CREATE INDEX idx_calendar_event_owner_range ON calendar_event(owner_id, start_at, end_at)`);

    // ── Reminders ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE reminder_list (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        name          VARCHAR(128) NOT NULL,
        color         VARCHAR(16) NOT NULL DEFAULT '#007AFF',
        icon          VARCHAR(32),
        "position"    INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_reminder_list_owner ON reminder_list(owner_id)`);

    await qr.query(`
      CREATE TABLE reminder (
        id                    BIGSERIAL PRIMARY KEY,
        owner_id              BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        list_id               BIGINT REFERENCES reminder_list(id) ON DELETE SET NULL,
        title                 VARCHAR(255) NOT NULL,
        notes                 TEXT,
        due_at                TIMESTAMPTZ,
        completed_at          TIMESTAMPTZ,
        priority              VARCHAR(16) NOT NULL DEFAULT 'NONE',
        flag                  BOOLEAN NOT NULL DEFAULT false,
        "position"            INTEGER NOT NULL DEFAULT 0,
        notify_minutes_before INTEGER,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id         BIGINT,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id         BIGINT,
        deleted_at            TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_reminder_owner ON reminder(owner_id)`);
    await qr.query(`CREATE INDEX idx_reminder_list ON reminder(list_id)`);
    await qr.query(`CREATE INDEX idx_reminder_owner_due ON reminder(owner_id, due_at) WHERE completed_at IS NULL`);

    // ── Vault ────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE vault_entity (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        name          VARCHAR(255) NOT NULL,
        category      VARCHAR(64),
        description   VARCHAR(512),
        icon          VARCHAR(32),
        color         VARCHAR(16) NOT NULL DEFAULT '#6366F1',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_vault_entity_owner ON vault_entity(owner_id)`);

    await qr.query(`
      CREATE TABLE vault_item (
        id              BIGSERIAL PRIMARY KEY,
        entity_id       BIGINT NOT NULL REFERENCES vault_entity(id) ON DELETE CASCADE,
        owner_id        BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        label           VARCHAR(255) NOT NULL,
        encrypted_value TEXT NOT NULL,
        description     VARCHAR(512),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id   BIGINT,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id   BIGINT,
        deleted_at      TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_vault_item_entity ON vault_item(entity_id)`);
    await qr.query(`CREATE INDEX idx_vault_item_owner ON vault_item(owner_id)`);

    // ── Gmail / Outlook (provider on gmail_account) ──────────────────────
    await qr.query(`
      CREATE TABLE gmail_account (
        id                BIGSERIAL PRIMARY KEY,
        owner_id          BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        email             VARCHAR(160) NOT NULL,
        display_name      VARCHAR(160),
        access_token_enc  TEXT NOT NULL,
        refresh_token_enc TEXT,
        token_expires_at  TIMESTAMPTZ,
        scopes            VARCHAR(512),
        history_id        VARCHAR(64),
        last_sync_at      TIMESTAMPTZ,
        provider          VARCHAR(16) NOT NULL DEFAULT 'google',
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id     BIGINT,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id     BIGINT,
        deleted_at        TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_gmail_account_owner ON gmail_account(owner_id)`);
    await qr.query(
      `CREATE UNIQUE INDEX uq_gmail_account_owner_email_provider
         ON gmail_account(owner_id, email, provider) WHERE deleted_at IS NULL`,
    );

    await qr.query(`
      CREATE TABLE gmail_message (
        id                BIGSERIAL PRIMARY KEY,
        gmail_account_id  BIGINT NOT NULL REFERENCES gmail_account(id) ON DELETE CASCADE,
        gmail_message_id  VARCHAR(64) NOT NULL,
        thread_id         VARCHAR(64),
        snippet           TEXT,
        from_addr         VARCHAR(255),
        to_addr           VARCHAR(512),
        subject           VARCHAR(512),
        received_at       TIMESTAMPTZ,
        unread            BOOLEAN NOT NULL DEFAULT false,
        has_attachment    BOOLEAN NOT NULL DEFAULT false,
        labels            VARCHAR(512),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id     BIGINT,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id     BIGINT,
        deleted_at        TIMESTAMPTZ,
        CONSTRAINT uq_gmail_message_account_msg UNIQUE (gmail_account_id, gmail_message_id)
      )
    `);
    await qr.query(`CREATE INDEX idx_gmail_message_account ON gmail_message(gmail_account_id)`);
    await qr.query(`CREATE INDEX idx_gmail_message_account_received ON gmail_message(gmail_account_id, received_at)`);

    // ── AI (chatbot) ─────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE ai_conversation (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        title         VARCHAR(255) NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_ai_conversation_owner ON ai_conversation(owner_id)`);

    await qr.query(`
      CREATE TABLE ai_message (
        id              BIGSERIAL PRIMARY KEY,
        owner_id        BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        conversation_id BIGINT NOT NULL REFERENCES ai_conversation(id) ON DELETE CASCADE,
        role            VARCHAR(16) NOT NULL,
        content         TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id   BIGINT,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id   BIGINT,
        deleted_at      TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_ai_message_owner ON ai_message(owner_id)`);
    await qr.query(`CREATE INDEX idx_ai_message_conversation ON ai_message(conversation_id)`);

    // ── Push subscriptions + Notifications ───────────────────────────────
    await qr.query(`
      CREATE TABLE push_subscription (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        endpoint      TEXT NOT NULL,
        p256dh        TEXT NOT NULL,
        auth          TEXT NOT NULL,
        user_agent    VARCHAR(256),
        last_used_at  TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_push_subscription_owner ON push_subscription(owner_id)`);
    await qr.query(
      `CREATE UNIQUE INDEX uq_push_subscription_endpoint_live
         ON push_subscription(endpoint) WHERE deleted_at IS NULL`,
    );

    await qr.query(`
      CREATE TABLE notification (
        id             BIGSERIAL PRIMARY KEY,
        owner_id       BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        kind           VARCHAR(32) NOT NULL,
        source_id      BIGINT,
        scheduled_at   TIMESTAMPTZ NOT NULL,
        dispatched_at  TIMESTAMPTZ,
        read_at        TIMESTAMPTZ,
        title          VARCHAR(200) NOT NULL,
        body           VARCHAR(500),
        deep_link      VARCHAR(256),
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id  BIGINT,
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id  BIGINT,
        deleted_at     TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_notification_owner_scheduled ON notification(owner_id, scheduled_at)`);
    await qr.query(
      `CREATE INDEX idx_notification_pending ON notification(scheduled_at)
         WHERE dispatched_at IS NULL AND deleted_at IS NULL`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX uq_notification_source_live
         ON notification(owner_id, kind, source_id, scheduled_at) WHERE deleted_at IS NULL`,
    );

    // ── Time block ───────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE time_block (
        id                    BIGSERIAL PRIMARY KEY,
        owner_id              BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        title                 VARCHAR(200) NOT NULL,
        notes                 TEXT,
        start_at              TIMESTAMPTZ NOT NULL,
        end_at                TIMESTAMPTZ NOT NULL,
        category              VARCHAR(32),
        color_token           VARCHAR(24),
        notify_minutes_before INTEGER,
        completed_at          TIMESTAMPTZ,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id         BIGINT,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id         BIGINT,
        deleted_at            TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_time_block_owner_start ON time_block(owner_id, start_at)`);

    // ── Finance ──────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE finance_account (
        id              BIGSERIAL PRIMARY KEY,
        owner_id        BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        name            VARCHAR(120) NOT NULL,
        type            VARCHAR(16) NOT NULL DEFAULT 'bank',
        currency        VARCHAR(3) NOT NULL DEFAULT 'TRY',
        opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
        color_token     VARCHAR(24),
        icon            VARCHAR(32),
        archived        BOOLEAN NOT NULL DEFAULT false,
        "position"      INTEGER NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id   BIGINT,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id   BIGINT,
        deleted_at      TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_finance_account_owner ON finance_account(owner_id)`);

    await qr.query(`
      CREATE TABLE finance_category (
        id            BIGSERIAL PRIMARY KEY,
        owner_id      BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        name          VARCHAR(80) NOT NULL,
        kind          VARCHAR(16) NOT NULL,
        color_token   VARCHAR(24),
        icon          VARCHAR(32),
        "position"    INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id BIGINT,
        deleted_at    TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_finance_category_owner ON finance_category(owner_id)`);
    await qr.query(
      `CREATE UNIQUE INDEX uq_finance_category_owner_name_kind_live
         ON finance_category(owner_id, name, kind) WHERE deleted_at IS NULL`,
    );

    await qr.query(`
      CREATE TABLE finance_debt (
        id                    BIGSERIAL PRIMARY KEY,
        owner_id              BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        direction             VARCHAR(16) NOT NULL,
        counterparty          VARCHAR(160) NOT NULL,
        principal_amount      NUMERIC(14,2) NOT NULL,
        currency              VARCHAR(3) NOT NULL DEFAULT 'TRY',
        interest_rate         NUMERIC(5,2),
        due_at                TIMESTAMPTZ,
        settled_at            TIMESTAMPTZ,
        notify_minutes_before INTEGER,
        notes                 TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id         BIGINT,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id         BIGINT,
        deleted_at            TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_finance_debt_owner ON finance_debt(owner_id)`);
    await qr.query(`CREATE INDEX idx_finance_debt_owner_due ON finance_debt(owner_id, due_at)`);

    await qr.query(`
      CREATE TABLE finance_transaction (
        id                BIGSERIAL PRIMARY KEY,
        owner_id          BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        account_id        BIGINT NOT NULL REFERENCES finance_account(id) ON DELETE CASCADE,
        category_id       BIGINT REFERENCES finance_category(id) ON DELETE SET NULL,
        kind              VARCHAR(16) NOT NULL,
        amount            NUMERIC(14,2) NOT NULL,
        currency          VARCHAR(3) NOT NULL DEFAULT 'TRY',
        occurred_at       TIMESTAMPTZ NOT NULL,
        description       TEXT,
        transfer_pair_id  BIGINT REFERENCES finance_transaction(id) ON DELETE CASCADE,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id     BIGINT,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_id     BIGINT,
        deleted_at        TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_finance_transaction_owner ON finance_transaction(owner_id)`);
    await qr.query(`CREATE INDEX idx_finance_transaction_account ON finance_transaction(account_id)`);
    await qr.query(
      `CREATE INDEX idx_finance_transaction_owner_occurred
         ON finance_transaction(owner_id, occurred_at DESC)`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    const tables = [
      'finance_transaction',
      'finance_debt',
      'finance_category',
      'finance_account',
      'time_block',
      'notification',
      'push_subscription',
      'ai_message',
      'ai_conversation',
      'gmail_message',
      'gmail_account',
      'vault_item',
      'vault_entity',
      'reminder',
      'reminder_list',
      'calendar_event',
      'plan_item',
      'plan',
      'task',
      'project',
      'list_item',
      'todo_list',
      'note_tag_assignment',
      'note_tag',
      'note',
      'user_invite',
      'refresh_token',
      'app_user',
    ];
    for (const t of tables) {
      await qr.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
  }
}
