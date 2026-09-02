import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLearningTracker1715000020000 implements MigrationInterface {
  name = 'AddLearningTracker1715000020000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE learning_topic (
        id BIGSERIAL PRIMARY KEY, owner_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        title VARCHAR(160) NOT NULL, description TEXT, position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by_id BIGINT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by_id BIGINT, deleted_at TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_learning_topic_owner_position ON learning_topic(owner_id, position)`);
    await qr.query(`
      CREATE TABLE learning_item (
        id BIGSERIAL PRIMARY KEY, topic_id BIGINT NOT NULL REFERENCES learning_topic(id) ON DELETE CASCADE,
        text VARCHAR(300) NOT NULL, url VARCHAR(512), notes TEXT, estimated_minutes INTEGER,
        review_at TIMESTAMPTZ, notify_minutes_before INTEGER, completed_at TIMESTAMPTZ,
        position INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id BIGINT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by_id BIGINT, deleted_at TIMESTAMPTZ
      )
    `);
    await qr.query(`CREATE INDEX idx_learning_item_topic_position ON learning_item(topic_id, position)`);
    await qr.query(`CREATE INDEX idx_learning_item_topic_pending ON learning_item(topic_id) WHERE completed_at IS NULL`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    for (const t of ['learning_item', 'learning_topic']) await qr.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
  }
}
